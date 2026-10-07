import type { ProductionItem, PublishedShort } from "@/lib/data/types";
import type { ProductionItemInput, ProductionItemPatch, TrackerStore } from "@/lib/db/store";

/**
 * Produktions-Speicher im Arbeitsspeicher – für Tests und die Beispieldaten
 * (DATA_SOURCE=mock). Geht beim Neustart verloren.
 */
export class MemoryTrackerStore implements TrackerStore {
  items = new Map<number, ProductionItem>();
  targets: Record<string, number> = {};
  private nextId = 1;

  constructor(private readonly published: (from: number, to: number) => PublishedShort[] = () => []) {}

  async listProductionItems(fromDay: string, toDay: string) {
    return [...this.items.values()]
      .filter((i) => i.day === null || (i.day >= fromDay && i.day <= toDay))
      .sort((a, b) => a.createdAt - b.createdAt);
  }
  async createProductionItem(input: ProductionItemInput, at: number) {
    const item: ProductionItem = {
      id: this.nextId++,
      channelId: input.channelId,
      day: input.day,
      title: input.title ?? "",
      status: input.status ?? "idea",
      note: input.note ?? "",
      link: input.link ?? null,
      createdAt: at + this.nextId / 1000, // stabile Reihenfolge bei gleicher Zeit
    };
    this.items.set(item.id, item);
    return item;
  }
  async updateProductionItem(id: number, patch: ProductionItemPatch) {
    const old = this.items.get(id);
    if (!old) return null;
    const next: ProductionItem = {
      ...old,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
    } as ProductionItem;
    this.items.set(id, next);
    return next;
  }
  async deleteProductionItem(id: number) {
    this.items.delete(id);
  }
  async getProductionTargets() {
    return { ...this.targets };
  }
  async setProductionTarget(channelId: string, perDay: number) {
    this.targets[channelId] = perDay;
  }
  async getPublishedOwn(from: number, to: number) {
    return this.published(from, to);
  }
}
