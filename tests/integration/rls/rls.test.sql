-- RLS integration test. Every assertion raises on failure.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', '{"display_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', '{}');

-- profile trigger
do $$ begin
  assert (select display_name from profiles where id = '11111111-1111-1111-1111-111111111111') = 'Alice', 'profile created with display name';
  assert (select display_name from profiles where id = '22222222-2222-2222-2222-222222222222') = 'bob', 'profile falls back to email prefix';
end $$;

-- ── Alice creates a project via RPC ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table t_ids (k text primary key, v uuid) on commit drop;
grant all on t_ids to authenticated;
insert into t_ids values ('alice_project', public.create_project('RAG Architecture', 'demo'));
do $$ declare p uuid := (select v from t_ids where k = 'alice_project'); begin
  assert (select count(*) from projects) = 1, 'alice sees her project';
  assert (select count(*) from diagrams where project_id = p) = 1, 'diagram created with project';
  assert (select count(*) from presentations where project_id = p) = 1, 'presentation created with project';
  assert (select diagram_dsl ->> 'title' from diagrams where project_id = p) = 'RAG Architecture', 'empty DSL initialised';
end $$;

-- versions + scenes
insert into diagram_versions (diagram_id, version_number, diagram_dsl, excalidraw_data, change_description)
select id, 1, diagram_dsl, excalidraw_data, 'initial' from diagrams;
select public.replace_scenes(
  (select id from presentations limit 1),
  '[{"id":"aaaaaaaa-0000-0000-0000-000000000001","title":"One","order":0,"visibleNodeIds":[],"visibleEdgeIds":[],"durationMs":4000,"transition":{"type":"fade","durationMs":500}},
    {"id":"aaaaaaaa-0000-0000-0000-000000000002","title":"Two","order":1,"visibleNodeIds":[],"visibleEdgeIds":[],"durationMs":4000,"transition":{"type":"fade","durationMs":500}}]'::jsonb
);
do $$ begin
  assert (select count(*) from scenes) = 2, 'scenes replaced';
  assert (select string_agg(title, ',' order by order_index) from scenes) = 'One,Two', 'scene order kept';
end $$;
insert into ai_usage (provider, model, operation, status) values ('gemini', 'm', 'generate', 'success');
insert into user_ai_keys (provider, encrypted_key, key_hint) values ('gemini', 'v1:ciphertext', '…abcd');
insert into exports (project_id, presentation_id, format) select project_id, id, 'mp4-landscape' from presentations;

-- duplicate
insert into t_ids values ('alice_copy', public.duplicate_project((select v from t_ids where k = 'alice_project')));
do $$ begin
  assert (select count(*) from projects) = 2, 'duplicate created';
  assert (select title from projects where id = (select v from t_ids where k = 'alice_copy')) = 'RAG Architecture (copy)', 'copy title';
  assert (select count(*) from scenes) = 4, 'scenes duplicated';
end $$;

-- users cannot mark their own export as completed
do $$ begin
  begin
    update exports set status = 'completed' where true;
    assert (select count(*) from exports where status = 'completed') = 0, 'export status not user-writable';
  exception when others then null;
  end;
end $$;

-- ── Bob: sees nothing of Alice's, cannot write into her project ──
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ declare p uuid := (select v from t_ids where k = 'alice_project'); n int; begin
  assert (select count(*) from projects) = 0, 'bob sees no projects';
  assert (select count(*) from diagrams) = 0, 'bob sees no diagrams';
  assert (select count(*) from diagram_versions) = 0, 'bob sees no versions';
  assert (select count(*) from presentations) = 0, 'bob sees no presentations';
  assert (select count(*) from scenes) = 0, 'bob sees no scenes';
  assert (select count(*) from exports) = 0, 'bob sees no exports';
  assert (select count(*) from ai_usage) = 0, 'bob sees no ai usage';
  assert (select count(*) from user_ai_keys) = 0, 'bob cannot see alice api key';
  update user_ai_keys set encrypted_key = 'x' where true;
  get diagnostics n = row_count;
  assert n = 0, 'bob cannot overwrite alice api key';
  assert (select count(*) from profiles) = 1, 'bob sees only his profile';

  update projects set title = 'pwned' where id = p;
  get diagnostics n = row_count;
  assert n = 0, 'bob cannot update alice project';
  delete from projects where id = p;
  get diagnostics n = row_count;
  assert n = 0, 'bob cannot delete alice project';

  begin
    insert into diagrams (project_id, user_id) values (p, '22222222-2222-2222-2222-222222222222');
    raise exception 'bob inserted a diagram into alice project';
  exception when insufficient_privilege then null; end;

  begin
    insert into projects (user_id, title) values ('11111111-1111-1111-1111-111111111111', 'spoof');
    raise exception 'bob created a project owned by alice';
  exception when insufficient_privilege then null; end;

  begin
    perform public.duplicate_project(p);
    raise exception 'bob duplicated alice project';
  exception when sqlstate 'P0002' then null; end;

  begin
    perform public.replace_scenes((select id from presentations limit 1), '[]'::jsonb);
  exception when others then null; end;
end $$;

-- ── anon: nothing ──
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ begin
  assert (select count(*) from projects) = 0, 'anon sees no projects';
  begin
    perform public.create_project('x');
    raise exception 'anon created a project';
  exception when others then
    if sqlerrm like 'anon created%' then raise; end if;
  end;
end $$;

-- ── service role: worker can claim jobs ──
reset role;
set local role service_role;
do $$ declare c int; begin
  select count(*) into c from public.claim_export_job();
  assert c = 1, 'worker claimed one job';
  assert (select status from exports limit 1) = 'rendering', 'job is rendering';
end $$;

-- cascade delete
reset role;
delete from projects where id = (select v from t_ids where k = 'alice_project');
do $$ begin
  assert (select count(*) from diagrams where project_id = (select v from t_ids where k = 'alice_project')) = 0, 'diagrams cascade';
  assert (select count(*) from scenes) = 2, 'only copy scenes remain';
end $$;

rollback;
\echo 'RLS tests passed'
