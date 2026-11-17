import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

// Inventory categories come from the server (Inventory → Manage Categories), so new kinds of
// stock can be added from the portal. One shared copy for the whole app.
const Ctx = createContext(null);

export function CategoriesProvider({ children }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(
    () =>
      api
        .categories()
        .then(setList)
        .catch(() => {})
        .finally(() => setLoading(false)),
    []
  );
  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo(() => {
    const map = Object.fromEntries(list.map((c) => [c.name, c]));
    const byName = (name) => map[name];
    return {
      list,
      loading,
      reload,
      names: list.map((c) => c.name),
      byName,
      // Icon name for a category (falls back to the category name, then "Other")
      icon: (name) => map[name]?.icon || name,
      // Spec fields shown for a category + sub-category
      fieldsFor: (name, subCategory) =>
        (map[name]?.fields || []).filter((f) => !f.appliesTo?.length || !subCategory || f.appliesTo.includes(subCategory)),
      // Short one-line spec summary for tables, e.g. "Intel Core i5 · 16 GB · 512 GB SSD"
      specSummary: (item) => {
        const fields = map[item.category]?.fields;
        const values = fields ? fields.map((f) => item.specs?.[f.key]) : Object.values(item.specs || {});
        return values.filter(Boolean).slice(0, 4).join(' · ');
      },
    };
  }, [list, loading, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCategories = () => useContext(Ctx);
