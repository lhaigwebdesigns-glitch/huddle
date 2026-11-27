/** The name to greet someone by. A title stays with the name: "Mrs. Pat Lee" is "Mrs. Pat", not "Mrs."; "Ava Lin" is "Ava". */
export function greetName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1 && /^(mr|mrs|ms|miss|mx|dr|prof|sr|sra)\.?$/i.test(parts[0])) return `${parts[0]} ${parts[1]}`;
  return parts[0] || name;
}
