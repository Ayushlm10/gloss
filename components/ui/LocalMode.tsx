"use client";
import { createContext, useContext } from "react";
const LocalMode = createContext(false);
export function LocalModeProvider({ local, children }: { local: boolean; children: React.ReactNode }) {
  return <LocalMode.Provider value={local}>{children}</LocalMode.Provider>;
}
export function useLocalMode() { return useContext(LocalMode); }
