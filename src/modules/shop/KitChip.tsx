/** Chip "KIT": aparece antes do nome de produtos que são kits (vitrine, produto, sugestões e lista do painel). */
export function KitChip() {
  return (
    <span className="mr-1.5 inline-flex h-[1.1rem] min-w-[2rem] items-center justify-center rounded-md bg-primary px-1.5 align-[-0.2em] text-[0.65rem] font-extrabold leading-none tracking-wide text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/0.22)]">
      <span className="translate-y-[0.5px]">KIT</span>
    </span>
  )
}
