import { useEffect, useState } from "react";
import { api } from "./api.js";

export function useConfig() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api("/api/config")
      .then((data) => {
        if (active) setConfig(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  return { config, error };
}
