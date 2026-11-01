"use client";
import { createContext, useContext, useMemo, useState } from "react";
import { DEFAULT_TOPIC, TOPICS, type Topic } from "./topics";

interface TopicState {
  topic: Topic;
  setTopic: (id: string) => void;
  /** Bumps every time a topic is picked, so the hero can replay its drawing. */
  pickCount: number;
}

const TopicContext = createContext<TopicState>({ topic: TOPICS[0], setTopic: () => undefined, pickCount: 0 });

/** The diagram the visitor picked in the hero. Every demo on the page follows it. */
export function TopicProvider({ children }: { children: React.ReactNode }) {
  const [id, setId] = useState(DEFAULT_TOPIC);
  const [pickCount, setPickCount] = useState(0);
  const value = useMemo<TopicState>(
    () => ({
      topic: TOPICS.find((t) => t.id === id) ?? TOPICS[0],
      setTopic: (next) => {
        setId(next);
        setPickCount((c) => c + 1);
      },
      pickCount,
    }),
    [id, pickCount],
  );
  return <TopicContext.Provider value={value}>{children}</TopicContext.Provider>;
}

export function useTopic() {
  return useContext(TopicContext);
}
