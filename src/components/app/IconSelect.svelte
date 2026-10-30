<!--
  Elegir un icono de una lista corta de cosas de dinero.
-->
<script lang="ts" module>
  export const ICONS = [
    "bank",
    "wallet-01",
    "wallet-02",
    "credit-card",
    "coins-01",
    "money-bag-02",
    "piggy-bank",
    "analytics-up",
    "chart-increase",
    "house-01",
    "home-01",
    "building-03",
    "car-01",
    "airplane-01",
    "umbrella",
    "shield-01",
    "user-group",
    "gift",
    "briefcase-01",
    "book-open-01",
    "medicine-02",
    "shopping-cart-01",
    "shopping-bag-01",
    "restaurant-01",
    "flash",
    "play-list",
    "game-controller-03",
    "court-house",
    "store-01",
    "plant-01",
    "target-01",
    "sparkles",
    "atm-01",
    "money-receive-01",
    "money-send-01",
    "money-add-01",
    "invoice-01",
    "more-horizontal",
  ];
</script>

<script lang="ts">
  import Icon from "../Icon.svelte";

  let { value = $bindable("") }: { value?: string } = $props();
</script>

<div class="icon-grid">
  {#each ICONS as name (name)}
    <button
      type="button"
      class="icon-choice"
      class:selected={value === name}
      aria-pressed={value === name}
      aria-label={name}
      onclick={() => (value = name)}
    >
      <Icon {name} size={18} />
    </button>
  {/each}
</div>

<style>
  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(2.1rem, 1fr));
    gap: var(--sp-4);
  }

  .icon-choice {
    display: grid;
    place-items: center;
    height: 2.1rem;
    border-radius: var(--radius-sm);
    border: var(--border-width) solid var(--border);
    background: var(--bg-field);
    color: var(--text-secondary);
    cursor: pointer;

    &:hover {
      color: var(--text-primary);
      border-color: var(--border-strong);
    }

    &.selected {
      background: var(--accent-soft);
      color: var(--accent-soft-text);
      border-color: var(--accent);
    }
  }
</style>
