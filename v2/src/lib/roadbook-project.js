export function resolveRoadbookProjectGroup(roadbook) {
  const value = roadbook.projectStatus || roadbook.project || "";
  const normalized = String(value).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["done", "deja fait", "deja faits", "deja-fait", "fait", "termine", "voyage realise", "voyage-realise", "realise", "realized"].includes(normalized)) return "done";
  if (["todo", "a faire", "a-faire", "planned", "en projet", "en-projet", "projet"].includes(normalized)) return "todo";
  return "other";
}

export function groupPersonalRoadbooks(roadbooks, userId) {
  const groups = [
    { key: "todo", title: "En projet", items: [] },
    { key: "done", title: "Voyage réalisé", items: [] },
    { key: "other", title: "Autres roadbooks", items: [] },
    { key: "shared", title: "Partagés avec moi", items: [] },
  ];
  const byKey = new Map(groups.map(group => [group.key, group]));
  for (const roadbook of roadbooks) {
    const key = roadbook.owner_id === userId ? resolveRoadbookProjectGroup(roadbook) : "shared";
    byKey.get(key).items.push(roadbook);
  }
  return groups.filter(group => group.items.length > 0);
}
