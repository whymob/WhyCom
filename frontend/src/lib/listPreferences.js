import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export function useListFilters(pageKey, initialFilters) {
  const initialRef = useRef(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [preferences, setPreferences] = useState({});

  useEffect(() => {
    api.get("/auth/me")
      .then(({ data }) => setPreferences(data.list_preferences || {}))
      .catch(() => setPreferences({}));
  }, []);

  useEffect(() => {
    const saved = preferences[pageKey];
    const hasUrlFilters = Object.values(initialRef.current).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));
    if (!hasUrlFilters && saved) setFilters({ ...initialRef.current, ...saved });
  }, [pageKey, preferences]);

  const saveFilters = async (nextFilters) => {
    const nextPreferences = { ...preferences, [pageKey]: nextFilters };
    await api.patch("/auth/me/preferences", { list_preferences: nextPreferences });
    setPreferences(nextPreferences);
    setFilters(nextFilters);
  };

  const clearSavedFilters = async () => {
    const nextPreferences = { ...preferences };
    delete nextPreferences[pageKey];
    await api.patch("/auth/me/preferences", { list_preferences: nextPreferences });
    setPreferences(nextPreferences);
    setFilters(initialRef.current);
  };

  return { filters, setFilters, saveFilters, clearSavedFilters };
}
