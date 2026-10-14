import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, onLibraryChange } from "./api.js";

const KEY = "tubelog.activeChannel";
const Context = createContext({ channels: [], active: null, loading: true, setActive: () => {}, reload: () => {} });

// The channel you are working on. Your own channels come from /api/my-channels; the choice is remembered.
export function ActiveChannelProvider({ children }) {
  const [channels, setChannels] = useState(null);
  const [slug, setSlug] = useState(() => {
    try {
      return localStorage.getItem(KEY) || "";
    } catch {
      return "";
    }
  });

  const reload = useCallback(
    () =>
      api("/api/my-channels")
        .then((data) => setChannels(data.channels || []))
        .catch(() => setChannels((current) => current || [])),
    [],
  );

  useEffect(() => {
    reload();
    return onLibraryChange(reload);
  }, [reload]);

  const setActive = useCallback((next) => {
    setSlug(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage can be unavailable */
    }
  }, []);

  const list = channels || [];
  const active = useMemo(() => list.find((channel) => channel.slug === slug) || list[0] || null, [list, slug]);
  const value = useMemo(() => ({ channels: list, active, loading: channels === null, setActive, reload }), [list, active, channels, setActive, reload]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useActiveChannel() {
  return useContext(Context);
}
