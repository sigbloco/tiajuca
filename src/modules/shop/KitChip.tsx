/** Chip "KIT": aparece antes do nome de produtos que são kits (vitrine, produto, sugestões e lista do painel). */
export function KitChip() {
  return (
    <span className="mr-1.5 inline-flex h-[1.1rem] min-w-[2rem] items-center justify-center rounded-md bg-primary px-1.5 align-middle text-[0.65rem] font-extrabold leading-none tracking-wide text-primary-foreground">
      <span className="-translate-y-[0.5px] [text-shadow:0_1px_1.5px_rgb(0_0_0/0.35)]">KIT</span>
    </span>
  )
}
