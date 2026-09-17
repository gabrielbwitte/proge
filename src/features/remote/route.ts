/** Rota da página mobile do controle remoto (`#/remote`). */
export function isRemoteRoute(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.hash.startsWith("#/remote")
  );
}
