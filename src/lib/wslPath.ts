/**
 * Translate an absolute file path into one a WSL Claude Code session can read.
 *
 * A Windows drive path (`C:\Users\…` or `C:/Users/…`) becomes its default WSL
 * automount equivalent (`/mnt/c/Users/…`): the drive letter is lowercased and
 * all backslashes become forward slashes. Any path that is not a Windows drive
 * path (already-POSIX, or unrecognized) is returned unchanged.
 *
 * Pure and dependency-free so it can be unit tested away from `chrome.*`.
 */
export function toClaudePath(absolutePath: string): string {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(absolutePath);
  if (!match) return absolutePath;

  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, "/");
  return `/mnt/${drive}/${rest}`;
}
