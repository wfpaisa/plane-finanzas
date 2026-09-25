<!--
  Ajustes, en cuatro secciones para no bajar por una página larga:
  - Categorías: icono, color, presupuesto y las palabras clave con que se
    categoriza lo que llega de Gmail. Gasto e ingreso en la misma lista.
  - Reglas: "si el movimiento dice X, es tal cosa".
  - Apariencia: el tinte del fondo de la app.
  - Cuenta y datos: el perfil, lo automático y el respaldo.
  La sección va en la URL (`?seccion=`), así se puede enlazar.
-->
<script lang="ts">
  import IconSelect from "../components/app/IconSelect.svelte";
  import MoneyInput from "../components/app/MoneyInput.svelte";
  import Money from "../components/app/Money.svelte";
  import Segmented from "../components/app/Segmented.svelte";
  import TagInput from "../components/app/TagInput.svelte";
  import TintPicker from "../components/app/TintPicker.svelte";
  import Icon from "../components/Icon.svelte";
  import Import from "./Import.svelte";
  import { Button, ConfirmDialog, Field, Input, Modal, Textarea } from "../components/ui";
  import Tag, { type Tone } from "../components/ui/Tag.svelte";
  import type { Backup, BackupFiles } from "../lib/backupZip";
  import type { Kind } from "../lib/finance";
  import { notify } from "../lib/notify.svelte";
  import { pb, session } from "../lib/pb.svelte";
  import { CATEGORY_TINT_NAMES, CATEGORY_TINTS, nextCategoryTint, tintFor } from "../lib/palettes";
  import { go, route } from "../lib/router.svelte";
  import { reload, store, touchTransactions } from "../lib/store.svelte";
  import { categoryTags } from "../lib/tags";
  import type { Category } from "../lib/types";

  const SECTIONS = [
    { id: "cuenta", label: "Cuenta y datos", icon: "user-circle" },
    { id: "categorias", label: "Categorías", icon: "tag-01" },
    { id: "gmail", label: "Gmail", icon: "mail-01" },
  ] as const;
  type Section = (typeof SECTIONS)[number]["id"];

  const section = $derived.by<Section>(() => {
    const s = route.query.get("seccion");
    if (SECTIONS.some((x) => x.id === s)) return s as Section;
    // Reglas e Importar eran pestañas; ahora van en Gmail.
    if (s === "reglas" || s === "importar" || route.query.get("regla")) return "gmail";
    return "cuenta";
  });

  let catKind = $state<Kind>("expense");
  let catQuery = $state("");
  let catTag = $state("");
  const cats = $derived.by(() => {
    const q = catQuery.trim().toLowerCase();
    return store.categories.filter(
      (c) =>
        c.kind === catKind &&
        (!catTag || c.tags?.includes(catTag)) &&
        (!q || [c.name, c.keywords, ...(c.tags ?? [])].some((x) => x?.toLowerCase().includes(q))),
    );
  });
  /** Las etiquetas de las categorías de este tipo, para filtrar la lista. */
  const kindTags = $derived([...new Set(store.categories.filter((c) => c.kind === catKind).flatMap((c) => c.tags ?? []))].sort());
  const kindCount = (k: Kind) => store.categories.filter((c) => c.kind === k).length;

  let name = $state(session.user?.name ?? "");
  let savingName = $state(false);

  let open = $state(false);
  let editing = $state<Category | null>(null);
  let cName = $state("");
  let cKind = $state<Kind>("expense");
  let cIcon = $state("tag-01");
  /** Vacío: el automático, uno que ninguna otra categoría del tipo tenga. */
  let cColor = $state("");
  const autoColor = $derived(nextCategoryTint(store.categories.filter((c) => c.id !== editing?.id), cKind));
  const shownColor = $derived(cColor || autoColor);
  let cKeywords = $state("");
  let cBudget = $state(0);
  let cTags = $state<string[]>([]);
  let busy = $state(false);
  let confirmDelete = $state(false);
  let running = $state(false);

  let exporting = $state(false);
  let backupFile = $state<{ name: string; data: Backup; files: BackupFiles; count: number; attachments: number } | null>(null);
  let restoring = $state(false);
  let confirmClean = $state(false);
  let cleaning = $state(false);
  let fileInput = $state<HTMLInputElement>();

  function edit(c: Category | null, kind: Kind = "expense") {
    editing = c;
    cName = c?.name ?? "";
    cKind = c?.kind ?? kind;
    cIcon = c?.icon || "tag-01";
    cColor = c?.color ?? "";
    cKeywords = c?.keywords ?? "";
    cBudget = c?.budget ?? 0;
    cTags = [...(c?.tags ?? [])];
    open = true;
  }

  async function saveCategory() {
    if (!cName.trim()) return notify.fail(new Error("Ponle nombre."));
    busy = true;
    try {
      const data = {
        owner: session.id,
        name: cName.trim(),
        kind: cKind,
        icon: cIcon,
        color: shownColor,
        keywords: cKeywords,
        budget: cKind === "expense" ? cBudget : 0,
        tags: cTags,
      };
      if (editing) await pb.collection("categories").update(editing.id, data);
      else await pb.collection("categories").create(data);
      await reload("categories");
      open = false;
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  async function removeCategory() {
    if (!editing) return;
    busy = true;
    try {
      await pb.collection("categories").delete(editing.id);
      await reload("categories");
      confirmDelete = false;
      open = false;
    } catch (err) {
      notify.fail(err);
    } finally {
      busy = false;
    }
  }

  async function saveName() {
    savingName = true;
    try {
      await pb.collection("users").update(session.id, { name });
      await pb.collection("users").authRefresh();
      notify.done("Perfil guardado");
    } catch (err) {
      notify.fail(err);
    } finally {
      savingName = false;
    }
  }

  async function runAutomatic() {
    running = true;
    try {
      const r = await pb.send<{ transactions: number; movements: number }>("/api/finanzas/automatic/run", { method: "POST" });
      await reload("accounts", "savings");
      notify.done(`${r.transactions} movimientos frecuentes y ${r.movements} aportes creados.`);
    } catch (err) {
      notify.fail(err);
    } finally {
      running = false;
    }
  }

  async function exportBackup() {
    exporting = true;
    try {
      const { exportZip } = await import("../lib/backupZip");
      const blob = await exportZip();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `finanzas-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      notify.fail(err);
    } finally {
      exporting = false;
    }
  }

  async function pickBackup(file: File | undefined) {
    if (!file) return;
    try {
      const { readBackup } = await import("../lib/backupZip");
      const { backup, files } = await readBackup(file);
      const count = backup.data.transactions?.length ?? 0;
      const attachments = [...files.values()].reduce((n, l) => n + l.length, 0);
      backupFile = { name: file.name, data: backup, files, count, attachments };
    } catch (err) {
      notify.fail(err);
    } finally {
      if (fileInput) fileInput.value = "";
    }
  }

  async function restoreBackup() {
    if (!backupFile) return;
    restoring = true;
    try {
      const r = await pb.send<{ transactions: number; accounts: number; files?: Record<string, string> }>("/api/finanzas/backup", {
        method: "POST",
        body: backupFile.data,
      });
      let failed = 0;
      if (backupFile.files.size) {
        const { uploadFiles } = await import("../lib/backupZip");
        failed = await uploadFiles(backupFile.files, r.files ?? {});
      }
      // El respaldo trae el nombre y el color de fondo: la sesión los recoge.
      await pb.collection("users").authRefresh();
      await reload();
      touchTransactions();
      const attachments = backupFile.attachments - failed;
      backupFile = null;
      notify.done(`Importado: ${r.accounts} cuentas y ${r.transactions} movimientos${attachments ? `, con ${attachments} adjuntos` : ""}.`);
      if (failed) notify.fail(new Error(`${failed} adjuntos no se pudieron subir.`));
    } catch (err) {
      notify.fail(err);
    } finally {
      restoring = false;
    }
  }

  async function cleanAll() {
    cleaning = true;
    try {
      const r = await pb.send<{ transactions: number }>("/api/finanzas/clean", { method: "POST" });
      await reload();
      touchTransactions();
      confirmClean = false;
      notify.done(`Todo borrado: ${r.transactions} movimientos.`);
    } catch (err) {
      notify.fail(err);
    } finally {
      cleaning = false;
    }
  }
</script>

<div class="page">
  <header class="page-head">
    <div>
      <h1>Ajustes</h1>
      <p>{session.user?.email}</p>
    </div>
  </header>

  <div class="chips settings-tabs" role="tablist">
    {#each SECTIONS as t (t.id)}
      <button
        type="button"
        role="tab"
        aria-selected={section === t.id}
        class="chip"
        class:active={section === t.id}
        onclick={() => go("/ajustes", { seccion: t.id })}
      >
        <Icon name={t.icon} />{t.label}
      </button>
    {/each}
  </div>

  {#if section === "categorias"}
    <div class="card">
      <div class="card-head">
        <div>
          <h3 class="card-title">Categorías</h3>
          <p class="card-sub">Las palabras clave permiten clasificar automáticamente los movimientos importados de Gmail.</p>
        </div>
        <div class="card-head-actions">
          <Button size="sm" variant="secondary" onclick={() => edit(null, catKind)}><Icon name="add-01" />Nueva</Button>
        </div>
      </div>
      <div class="card-body stack">
        <div class="cat-toolbar">
          <Segmented
            bind:value={catKind}
            onchange={() => (catTag = "")}
            options={[
              { id: "expense", label: `Gasto · ${kindCount("expense")}` },
              { id: "income", label: `Ingreso · ${kindCount("income")}` },
            ]}
          />
          <input class="field-control sm cat-search" type="search" placeholder="Buscar" bind:value={catQuery} aria-label="Buscar categoría" />
        </div>
        {#if kindTags.length || catTag}
          <div class="cat-tag-filter" aria-label="Filtrar por etiqueta">
            {#each [...new Set([catTag, ...kindTags].filter(Boolean))] as t (t)}
              <Tag tone={catTag === t ? (tintFor(t) as Tone) : "off"} pressed={catTag === t} onclick={() => (catTag = catTag === t ? "" : t)}>#{t}</Tag>
            {/each}
          </div>
        {/if}
        {#if cats.length}
          <div class="cat-grid">
            {#each cats as c (c.id)}
              <button type="button" class="cat-item" onclick={() => edit(c)}>
                <span class="cat-ico {c.color || 'tint-10'}"><Icon name={c.icon || "tag-01"} size={16} /></span>
                <span class="cat-main">
                  <span class="cat-name">{c.name}</span>
                  <span class="cat-keys">{c.keywords || "Sin palabras clave"}</span>
                  {#if c.tags?.length}
                    <span class="cat-tags">
                      {#each c.tags as t (t)}<Tag tone={tintFor(t) as Tone}>#{t}</Tag>{/each}
                    </span>
                  {/if}
                </span>
                {#if c.budget}<span class="small muted"><Money value={c.budget} />/mes</span>{/if}
              </button>
            {/each}
          </div>
        {:else}
          <p class="empty-card">{catQuery ? "Nada coincide con la búsqueda." : "Aún no hay categorías de este tipo."}</p>
        {/if}
      </div>
    </div>
  {:else if section === "gmail"}
    <Import />
  {:else}
    <div class="stack">
      <div class="split-even">
        <div class="card">
          <div class="card-head"><div><h3 class="card-title">Perfil</h3></div></div>
          <div class="card-body stack">
            <Field label="Nombre"><Input bind:value={name} /></Field>
            <div><Button loading={savingName} onclick={saveName}>Guardar</Button></div>
          </div>
        </div>
        <div class="card">
          <div class="card-head">
            <div>
              <h3 class="card-title">Movimientos automáticos</h3>
              <p class="card-sub">A las 6:00 a. m., la aplicación revisa si debe registrar un ingreso, gasto o aporte programado. Este proceso no mueve dinero en el banco.</p>
            </div>
          </div>
          <div class="card-body">
            <Button loading={running} onclick={runAutomatic}><Icon name="repeat" />Revisar ahora</Button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3 class="card-title">Tinte del fondo</h3>
            <p class="card-sub">El color del fondo de la aplicación, en claro y en oscuro. Se guarda en tu cuenta.</p>
          </div>
        </div>
        <div class="card-body"><TintPicker /></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3 class="card-title">Datos</h3>
            <p class="card-sub">Descarga un zip con todo: cuentas, categorías, movimientos, reglas, ahorros y los adjuntos (facturas, fotos). También puedes importar respaldos .json de antes.</p>
          </div>
        </div>
        <div class="card-body data-actions">
          <Button loading={exporting} onclick={exportBackup}><Icon name="database-export" />Exportar</Button>
          <Button onclick={() => fileInput?.click()}><Icon name="database-import" />Importar</Button>
          <input bind:this={fileInput} type="file" accept=".zip,.json,application/zip,application/json" hidden onchange={(e) => pickBackup(e.currentTarget.files?.[0])} />
          <span class="flex-1"></span>
          <Button variant="ghost" class="btn-danger" onclick={() => (confirmClean = true)}><Icon name="delete-02" />Borrar todo</Button>
        </div>
      </div>
    </div>
  {/if}
</div>

<Modal {open} onClose={() => (open = false)} title={editing ? "Editar categoría" : "Nueva categoría"}>
  <div class="stack">
    <div class="cat-preview"><Tag tone={shownColor as Tone}><Icon name={cIcon} />{cName || "Categoría"}</Tag></div>
    <Segmented
      bind:value={cKind}
      full
      options={[
        { id: "expense", label: "Gasto" },
        { id: "income", label: "Ingreso" },
      ]}
    />
    <Field label="Nombre"><Input bind:value={cName} autofocus /></Field>
    <div><p class="eyebrow">Icono</p><IconSelect bind:value={cIcon} /></div>
    <div>
      <p class="eyebrow">Color{#if !cColor}<span class="auto-note"> · automático</span>{/if}</p>
      <div class="tint-row" role="radiogroup" aria-label="Color">
        {#each CATEGORY_TINTS as t, i (t)}
          <button
            type="button"
            role="radio"
            class="opt-tile swatch-color"
            class:selected={shownColor === t}
            aria-checked={shownColor === t}
            style:background="var(--tinte-{i + 1})"
            data-tip={CATEGORY_TINT_NAMES[i]}
            aria-label={CATEGORY_TINT_NAMES[i]}
            onclick={() => (cColor = t)}
          ></button>
        {/each}
      </div>
    </div>
    <div>
      <p class="eyebrow">Etiquetas</p>
      <TagInput bind:value={cTags} suggestions={categoryTags()} />
      <p class="small muted cat-tag-hint">Los movimientos de esta categoría las heredan: sirven para filtrar y sumar en Movimientos, Análisis y el móvil. Con <b>#fijo</b>, el móvil la cuenta en los gastos fijos.</p>
    </div>
    <Field label="Palabras clave" hint="Escribe términos separados por comas, como exito, carulla, d1. No importa si usas mayúsculas o tildes.">
      <Textarea bind:value={cKeywords} rows={3} />
    </Field>
    {#if cKind === "expense"}
      <Field label="Límite de gasto mensual (opcional)" hint="La aplicación te mostrará cuánto te queda antes de llegar a este valor."><MoneyInput bind:value={cBudget} /></Field>
    {/if}
  </div>
  {#snippet footer()}
    {#if editing}
      <Button variant="ghost" class="btn-danger" onclick={() => (confirmDelete = true)}><Icon name="delete-02" />Borrar</Button>
      <span class="flex-1"></span>
    {/if}
    <Button onclick={() => (open = false)}>Cancelar</Button>
    <Button variant="secondary" loading={busy} onclick={saveCategory}>Guardar</Button>
  {/snippet}
</Modal>

<ConfirmDialog
  open={confirmDelete}
  onClose={() => (confirmDelete = false)}
  title="Borrar categoría"
  message="Los movimientos que usan esta categoría se conservarán, pero quedarán sin categoría."
  {busy}
  onConfirm={removeCategory}
/>

<ConfirmDialog
  open={!!backupFile}
  onClose={() => (backupFile = null)}
  title="Importar respaldo"
  message={`${backupFile?.name} contiene ${backupFile?.count} movimientos${backupFile?.attachments ? ` y ${backupFile.attachments} adjuntos` : ""}. Al continuar, reemplazará todos tus datos actuales. Descarga primero una copia si quieres conservarlos.`}
  confirmLabel="Reemplazar todo"
  busy={restoring}
  onConfirm={restoreBackup}
/>

<ConfirmDialog
  open={confirmClean}
  onClose={() => (confirmClean = false)}
  title="Borrar todo"
  message="Se borrarán tus cuentas, movimientos, ingresos y gastos frecuentes, ahorros y categorías. Gmail seguirá conectado y volverá a leer los correos desde el principio. Esta acción no se puede deshacer."
  confirmText="BORRAR"
  confirmHint="Escribe BORRAR para confirmar"
  busy={cleaning}
  onConfirm={cleanAll}
/>

<style>
  .settings-tabs {
    margin-bottom: var(--sp-16);
    max-width: 100%;
    overflow-x: auto;
  }

  .cat-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-10);
  }

  .cat-search {
    width: min(100%, 14rem);
  }

  .auto-note {
    text-transform: none;
    letter-spacing: 0;
  }

  .tint-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-6);
  }

  .data-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-8);
  }

  .cat-tag-filter,
  .cat-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4);
  }

  .cat-tags {
    margin-top: var(--sp-4);
  }

  .cat-tag-hint {
    margin-top: var(--sp-6);
  }

  .cat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: var(--sp-6);
  }

  .cat-item {
    display: flex;
    align-items: center;
    gap: var(--sp-10);
    padding: var(--sp-8);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--bg-hover);
    }
  }

  .cat-ico {
    display: grid;
    flex: none;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-sm);
  }

  .cat-main {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }

  .cat-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
  }


  .cat-keys {
    overflow: hidden;
    font-size: var(--text-xs);
    color: var(--text-muted);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .cat-preview {
    display: flex;
    justify-content: center;
  }
</style>
