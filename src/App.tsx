import { useDeferredValue, useState, useTransition, type ChangeEvent } from 'react'
import initialProducts from './data/products.initial.json'
import './App.css'
import {
  UNASSIGNED_LABEL,
  dedupeProductsBySku,
  parseProductsHtml,
} from './lib/parseProductsHtml'
import type { FilterState, Product } from './types/catalog'

const SEED_FILE_COUNT = 4
const FACET_SIZE = 6

const INITIAL_FILTERS: FilterState = {
  nameQuery: '',
  skuQuery: '',
  types: [],
  hsNames: [],
  categories: [],
}

const seedProducts = initialProducts as Product[]

type CatalogSummary = {
  label: string
  fileCount: number
  productCount: number
  invalidFiles: string[]
}

type FacetKey = 'types' | 'hsNames' | 'categories'

const SEED_SUMMARY: CatalogSummary = {
  label: 'Bundled seed snapshot',
  fileCount: SEED_FILE_COUNT,
  productCount: seedProducts.length,
  invalidFiles: [],
}

function normalizeQuery(value: string) {
  return value.trim().toLocaleLowerCase('vi-VN')
}

function matchesText(haystack: string, needle: string) {
  return normalizeQuery(haystack).includes(normalizeQuery(needle))
}

function sortFacetOptions(values: string[]) {
  return values.toSorted((left, right) =>
    left.localeCompare(right, 'vi-VN', { sensitivity: 'base' }),
  )
}

function collectFacetValues(products: Product[], key: 'type' | 'hsName' | 'category') {
  return sortFacetOptions(Array.from(new Set(products.map((product) => product[key]))))
}

function readSelectedValues(event: ChangeEvent<HTMLSelectElement>) {
  return Array.from(event.target.selectedOptions, (option) => option.value)
}

function buildImportMessage(summary: CatalogSummary) {
  if (!summary.invalidFiles.length) {
    return `Imported ${summary.productCount} products from ${summary.fileCount} file${summary.fileCount === 1 ? '' : 's'}.`
  }

  return `Imported ${summary.productCount} products from ${summary.fileCount} file${summary.fileCount === 1 ? '' : 's'} and skipped ${summary.invalidFiles.length} invalid file${summary.invalidFiles.length === 1 ? '' : 's'}.`
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <article className="stat-card">
      <p className="stat-card__label">{label}</p>
      <strong className="stat-card__value">{value}</strong>
      <p className="stat-card__detail">{detail}</p>
    </article>
  )
}

function FacetField({
  label,
  name,
  options,
  selected,
  onChange,
}: {
  label: string
  name: FacetKey
  options: string[]
  selected: string[]
  onChange: (name: FacetKey, values: string[]) => void
}) {
  return (
    <label className="filter-field filter-field--facet">
      <span>{label}</span>
      <select
        aria-label={label}
        className="filter-multiselect"
        multiple
        name={name}
        size={Math.min(FACET_SIZE, Math.max(options.length, 3))}
        value={selected}
        onChange={(event) => onChange(name, readSelectedValues(event))}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <small>{selected.length} selected</small>
    </label>
  )
}

function App() {
  const [products, setProducts] = useState(seedProducts)
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [catalogSummary, setCatalogSummary] = useState(SEED_SUMMARY)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const deferredNameQuery = useDeferredValue(filters.nameQuery)
  const deferredSkuQuery = useDeferredValue(filters.skuQuery)

  const typeOptions = collectFacetValues(products, 'type')
  const hsNameOptions = collectFacetValues(products, 'hsName')
  const categoryOptions = collectFacetValues(products, 'category')

  const selectedTypes = new Set(filters.types)
  const selectedHsNames = new Set(filters.hsNames)
  const selectedCategories = new Set(filters.categories)

  const filteredProducts = products.filter((product) => {
    if (deferredNameQuery && !matchesText(product.name, deferredNameQuery)) {
      return false
    }

    if (deferredSkuQuery && !matchesText(product.sku, deferredSkuQuery)) {
      return false
    }

    if (selectedTypes.size > 0 && !selectedTypes.has(product.type)) {
      return false
    }

    if (selectedHsNames.size > 0 && !selectedHsNames.has(product.hsName)) {
      return false
    }

    if (selectedCategories.size > 0 && !selectedCategories.has(product.category)) {
      return false
    }

    return true
  })

  function updateFilter<Key extends keyof FilterState>(key: Key, value: FilterState[Key]) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }))
  }

  function clearFilters() {
    setFilters(INITIAL_FILTERS)
  }

  function restoreSeedData() {
    startTransition(() => {
      setProducts(seedProducts)
      setFilters(INITIAL_FILTERS)
      setCatalogSummary(SEED_SUMMARY)
    })
    setErrorMessage(null)
    setFeedback('Restored the bundled seed snapshot.')
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files

    if (!fileList?.length) {
      return
    }

    setFeedback(null)
    setErrorMessage(null)

    try {
      const files = Array.from(fileList)
      const importedResults = await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          products: parseProductsHtml(await file.text(), file.name),
        })),
      )

      const validImports = importedResults.filter((result) => result.products.length > 0)
      const invalidFiles = importedResults
        .filter((result) => result.products.length === 0)
        .map((result) => result.fileName)

      if (validImports.length === 0) {
        setErrorMessage('No valid product rows were found in the selected HTML files.')
        event.target.value = ''
        return
      }

      const nextProducts = dedupeProductsBySku(validImports.flatMap((result) => result.products))
      const nextSummary: CatalogSummary = {
        label: `Imported snapshot · ${validImports.map((result) => result.fileName).join(', ')}`,
        fileCount: files.length,
        productCount: nextProducts.length,
        invalidFiles,
      }

      startTransition(() => {
        setProducts(nextProducts)
        setFilters(INITIAL_FILTERS)
        setCatalogSummary(nextSummary)
      })

      setFeedback(buildImportMessage(nextSummary))
    } catch {
      setErrorMessage('The selected files could not be parsed. Please export the product list HTML again and retry.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <main className="catalog-shell">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <p className="eyebrow">Minh &amp; Brothers Product Index</p>
          <h1>One catalog for every exported product page.</h1>
          <p className="hero-panel__lede">
            Search by name or SKU, slice the list by Type, HS Name, or Category,
            and reload future HTML exports without leaving the page.
          </p>
        </div>

        <div className="hero-panel__stats" aria-label="Catalog summary">
          <StatCard
            label="Visible Products"
            value={filteredProducts.length.toLocaleString('en-US')}
            detail={`Filtered from ${products.length.toLocaleString('en-US')} loaded products`}
          />
          <StatCard
            label="Catalog Source"
            value={catalogSummary.fileCount.toString()}
            detail={`${catalogSummary.fileCount} file${catalogSummary.fileCount === 1 ? '' : 's'} in the active snapshot`}
          />
          <StatCard
            label="Open Facets"
            value={(typeOptions.length + hsNameOptions.length + categoryOptions.length).toString()}
            detail="Distinct Type, HS Name, and Category values"
          />
        </div>
      </section>

      <section className="toolbar-panel">
        <div className="toolbar-panel__info">
          <p className="toolbar-panel__title">Active catalog</p>
          <p className="toolbar-panel__source">{catalogSummary.label}</p>
          <p className="toolbar-panel__meta">
            {catalogSummary.productCount.toLocaleString('en-US')} products
            {catalogSummary.invalidFiles.length > 0
              ? ` · ${catalogSummary.invalidFiles.length} skipped`
              : ''}
          </p>
        </div>

        <div className="toolbar-panel__actions">
          <label className="button button--primary" htmlFor="catalog-import">
            Import HTML Files
          </label>
          <input
            id="catalog-import"
            accept=".html,text/html"
            className="sr-only"
            multiple
            type="file"
            onChange={handleImport}
          />
          <button className="button button--ghost" type="button" onClick={restoreSeedData}>
            Reset to Seed Data
          </button>
          <button className="button button--ghost" type="button" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      </section>

      {(feedback || errorMessage || isPending) && (
        <section className="status-row" aria-live="polite">
          {isPending ? <p className="status-pill">Refreshing catalog…</p> : null}
          {feedback ? <p className="status-pill status-pill--success">{feedback}</p> : null}
          {errorMessage ? <p className="status-pill status-pill--error">{errorMessage}</p> : null}
        </section>
      )}

      <section className="filters-panel" aria-label="Product filters">
        <div className="filters-panel__header">
          <div>
            <p className="eyebrow">Filters</p>
            <h2>Refine the catalog in place.</h2>
          </div>
          <p className="filters-panel__hint">
            Text filters use substring matching. Facets use exact matches and combine
            together with AND logic.
          </p>
        </div>

        <div className="filters-grid">
          <label className="filter-field">
            <span>Tên</span>
            <input
              name="nameQuery"
              placeholder="Search by product name"
              type="search"
              value={filters.nameQuery}
              onChange={(event) => updateFilter('nameQuery', event.target.value)}
            />
          </label>

          <label className="filter-field">
            <span>SKU</span>
            <input
              name="skuQuery"
              placeholder="Search by SKU"
              type="search"
              value={filters.skuQuery}
              onChange={(event) => updateFilter('skuQuery', event.target.value)}
            />
          </label>

          <FacetField
            label="Type"
            name="types"
            options={typeOptions}
            selected={filters.types}
            onChange={(name, values) => updateFilter(name, values)}
          />

          <FacetField
            label="HS Name"
            name="hsNames"
            options={hsNameOptions}
            selected={filters.hsNames}
            onChange={(name, values) => updateFilter(name, values)}
          />

          <FacetField
            label="Category"
            name="categories"
            options={categoryOptions}
            selected={filters.categories}
            onChange={(name, values) => updateFilter(name, values)}
          />
        </div>
      </section>

      <section className="table-panel" aria-label="Filtered product results">
        <div className="table-panel__header">
          <div>
            <p className="eyebrow">Results</p>
            <h2>{filteredProducts.length.toLocaleString('en-US')} products on screen</h2>
          </div>
          <p className="table-panel__hint">
            The table stays on one page. Narrow screens can scroll horizontally.
          </p>
        </div>

        <div className="table-scroll">
          <table className="product-table">
            <thead>
              <tr>
                <th scope="col">Image</th>
                <th scope="col">Tên</th>
                <th scope="col">SKU</th>
                <th scope="col">Type</th>
                <th scope="col">HS Name</th>
                <th scope="col">HS Code</th>
                <th scope="col">Category</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td className="product-table__empty" colSpan={7}>
                    No products match the current filters.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.sku} className="catalog-row">
                    <td>
                      <a
                        className="thumb-link"
                        href={product.imageUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <img
                          alt={product.name}
                          className="product-thumb"
                          height={68}
                          loading="lazy"
                          src={product.imageUrl}
                          width={68}
                        />
                      </a>
                    </td>
                    <td className="product-table__name">{product.name}</td>
                    <td>
                      <code>{product.sku}</code>
                    </td>
                    <td>{product.type || UNASSIGNED_LABEL}</td>
                    <td>{product.hsName || UNASSIGNED_LABEL}</td>
                    <td>{product.hsCode || '—'}</td>
                    <td>{product.category || UNASSIGNED_LABEL}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

export default App
