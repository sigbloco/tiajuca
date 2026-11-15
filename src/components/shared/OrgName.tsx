/** Nome do bloco que, se precisar quebrar em duas linhas, quebra depois da primeira palavra: "Cordão" / "da Tia Juca". */
export function OrgName({ name, className }: { name: string; className?: string }) {
  const i = name.indexOf(' ')
  if (i < 0) return <span className={className}>{name}</span>
  return <span className={className}>{name.slice(0, i)} <span className="whitespace-nowrap">{name.slice(i + 1)}</span></span>
}
