import {
  type ChangeEvent,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  type TouchEvent as ReactTouchEvent,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from 'react'
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
const FALLBACK_IMAGE_URL = 'https://minhbros.com/upload/product/placeholder.jpg'
const GALLERY_SWIPE_THRESHOLD_PX = 48
const SCROLL_TOP_VISIBILITY_THRESHOLD_PX = 300

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

type ImageGalleryProps = {
  product: Product
  selectedImageIndex: number
  onClose: () => void
  onSelectImage: Dispatch<SetStateAction<number>>
}

type SwipeGesture = {
  source: 'pointer' | 'touch'
  startX: number
  startY: number
  hasTriggered: boolean
  pointerId?: number
  touchId?: number
}

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

function clearAdvancedOnlyFilters(filters: FilterState): FilterState {
  return {
    ...filters,
    nameQuery: '',
    types: [],
    hsNames: [],
    categories: [],
  }
}

function getPrimaryImageUrl(product: Product) {
  return product.imageUrls[0] ?? FALLBACK_IMAGE_URL
}

function isSwipePointer(pointerType: string) {
  return (
    pointerType === '' ||
    pointerType === 'mouse' ||
    pointerType === 'touch' ||
    pointerType === 'pen'
  )
}

function getTouchByIdentifier(
  touchList: TouchList | ReactTouchEvent<HTMLElement>['changedTouches'],
  touchId: number,
) {
  for (const touch of Array.from(touchList)) {
    if (touch.identifier === touchId) {
      return touch
    }
  }

  return null
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

function ImageGallery({
  product,
  selectedImageIndex,
  onClose,
  onSelectImage,
}: ImageGalleryProps) {
  const swipeGestureRef = useRef<SwipeGesture | null>(null)
  const imageCount = product.imageUrls.length
  const selectedImageUrl = product.imageUrls[selectedImageIndex] ?? getPrimaryImageUrl(product)

  function resetSwipeGesture() {
    swipeGestureRef.current = null
  }

  function selectRelativeImage(direction: 1 | -1) {
    if (imageCount < 2) {
      return
    }

    onSelectImage((currentImageIndex) => (currentImageIndex + direction + imageCount) % imageCount)
  }

  function triggerSwipeIfNeeded(
    swipeGesture: SwipeGesture,
    currentX: number,
    currentY: number,
  ) {
    if (swipeGesture.hasTriggered) {
      return false
    }

    const deltaX = currentX - swipeGesture.startX
    const deltaY = currentY - swipeGesture.startY

    if (
      Math.abs(deltaX) < GALLERY_SWIPE_THRESHOLD_PX ||
      Math.abs(deltaX) <= Math.abs(deltaY)
    ) {
      return false
    }

    swipeGesture.hasTriggered = true
    selectRelativeImage(deltaX < 0 ? 1 : -1)
    return true
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (
      !event.isPrimary ||
      !isSwipePointer(event.pointerType) ||
      (event.pointerType === 'mouse' && event.button !== 0) ||
      imageCount < 2
    ) {
      return
    }

    swipeGestureRef.current = {
      source: 'pointer',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      hasTriggered: false,
    }

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Ignore capture failures in browsers/environments that do not support it reliably.
      }
    }
  }

  function handleStagePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const swipeGesture = swipeGestureRef.current

    if (
      !swipeGesture ||
      swipeGesture.source !== 'pointer' ||
      swipeGesture.pointerId !== event.pointerId ||
      !event.isPrimary ||
      !isSwipePointer(event.pointerType)
    ) {
      return
    }

    if (triggerSwipeIfNeeded(swipeGesture, event.clientX, event.clientY)) {
      event.preventDefault()
    }
  }

  function handleStagePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const swipeGesture = swipeGestureRef.current

    if (
      !swipeGesture ||
      swipeGesture.source !== 'pointer' ||
      swipeGesture.pointerId !== event.pointerId ||
      !event.isPrimary ||
      !isSwipePointer(event.pointerType)
    ) {
      return
    }

    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // Ignore capture failures in browsers/environments that do not support it reliably.
      }
    }

    resetSwipeGesture()
  }

  function handleStagePointerCancel(event: ReactPointerEvent<HTMLElement>) {
    if (
      swipeGestureRef.current?.source === 'pointer' &&
      swipeGestureRef.current.pointerId === event.pointerId &&
      typeof event.currentTarget.releasePointerCapture === 'function'
    ) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // Ignore capture failures in browsers/environments that do not support it reliably.
      }
    }

    resetSwipeGesture()
  }

  function handleStageTouchStart(event: ReactTouchEvent<HTMLElement>) {
    if (imageCount < 2) {
      return
    }

    const firstTouch = event.changedTouches[0] ?? event.touches[0]

    if (!firstTouch) {
      return
    }

    if (
      swipeGestureRef.current?.source === 'pointer' &&
      swipeGestureRef.current.pointerId !== undefined &&
      typeof event.currentTarget.releasePointerCapture === 'function'
    ) {
      try {
        event.currentTarget.releasePointerCapture(swipeGestureRef.current.pointerId)
      } catch {
        // Ignore capture failures in browsers/environments that do not support it reliably.
      }
    }

    swipeGestureRef.current = {
      source: 'touch',
      touchId: firstTouch.identifier,
      startX: firstTouch.clientX,
      startY: firstTouch.clientY,
      hasTriggered: false,
    }
  }

  function handleStageTouchMove(event: ReactTouchEvent<HTMLElement>) {
    const swipeGesture = swipeGestureRef.current

    if (!swipeGesture || swipeGesture.source !== 'touch' || swipeGesture.touchId === undefined) {
      return
    }

    const currentTouch =
      getTouchByIdentifier(event.changedTouches, swipeGesture.touchId) ??
      getTouchByIdentifier(event.touches, swipeGesture.touchId)

    if (!currentTouch) {
      return
    }

    if (triggerSwipeIfNeeded(swipeGesture, currentTouch.clientX, currentTouch.clientY)) {
      event.preventDefault()
    }
  }

  function handleStageTouchEnd(event: ReactTouchEvent<HTMLElement>) {
    const swipeGesture = swipeGestureRef.current

    if (!swipeGesture || swipeGesture.source !== 'touch' || swipeGesture.touchId === undefined) {
      return
    }

    const changedTouch =
      getTouchByIdentifier(event.changedTouches, swipeGesture.touchId) ??
      event.changedTouches[0]

    resetSwipeGesture()

    if (!changedTouch) {
      return
    }
  }

  return (
    <div className="gallery-overlay" role="presentation" onClick={onClose}>
      <section
        aria-label={`${product.name} images`}
        aria-modal="true"
        className="gallery-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="gallery-modal__header">
          <div>
            <p className="eyebrow">Product Images</p>
            <h2>{product.name}</h2>
          </div>

          <button
            aria-label="Close image gallery"
            className="gallery-close"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <figure className="gallery-stage">
          <div
            className="gallery-stage__surface"
            onPointerCancel={handleStagePointerCancel}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
            onTouchCancel={resetSwipeGesture}
            onTouchEnd={handleStageTouchEnd}
            onTouchMove={handleStageTouchMove}
            onTouchStart={handleStageTouchStart}
          >
            <img
              alt={`${product.name} image ${selectedImageIndex + 1}`}
              className="gallery-stage__image"
              draggable={false}
              src={selectedImageUrl}
            />
          </div>
        </figure>

        <p className="gallery-counter">
          {selectedImageIndex + 1} / {product.imageUrls.length}
        </p>
        {imageCount > 1 ? <p className="gallery-swipe-hint">Swipe or drag to browse</p> : null}

        <div aria-label="Product image thumbnails" className="gallery-strip" role="list">
          {product.imageUrls.map((imageUrl, imageIndex) => (
            <button
              key={`${product.sku}-${imageUrl}`}
              aria-label={`Show image ${imageIndex + 1} of ${product.imageUrls.length}`}
              aria-pressed={selectedImageIndex === imageIndex}
              className={`gallery-thumb${selectedImageIndex === imageIndex ? ' gallery-thumb--selected' : ''}`}
              type="button"
              onClick={() => onSelectImage(imageIndex)}
            >
              <img
                alt=""
                className="gallery-thumb__image"
                loading="lazy"
                src={imageUrl}
              />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function App() {
  const [products, setProducts] = useState(seedProducts)
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [catalogSummary, setCatalogSummary] = useState(SEED_SUMMARY)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isCatalogInfoExpanded, setIsCatalogInfoExpanded] = useState(false)
  const [isAdvancedSearchExpanded, setIsAdvancedSearchExpanded] = useState(false)
  const [galleryProduct, setGalleryProduct] = useState<Product | null>(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [isScrollTopButtonVisible, setIsScrollTopButtonVisible] = useState(false)

  const deferredNameQuery = useDeferredValue(filters.nameQuery)
  const deferredSkuQuery = useDeferredValue(filters.skuQuery)

  const typeOptions = collectFacetValues(products, 'type')
  const hsNameOptions = collectFacetValues(products, 'hsName')
  const categoryOptions = collectFacetValues(products, 'category')

  const selectedTypes = new Set(filters.types)
  const selectedHsNames = new Set(filters.hsNames)
  const selectedCategories = new Set(filters.categories)
  const isCompactTable = !isAdvancedSearchExpanded
  const visibleTableColumnCount = isCompactTable ? 3 : 7

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

  function openGallery(product: Product, imageIndex = 0) {
    setGalleryProduct(product)
    setSelectedImageIndex(imageIndex)
  }

  function closeGallery() {
    setGalleryProduct(null)
    setSelectedImageIndex(0)
  }

  const handleGalleryEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeGallery()
    }
  })

  useEffect(() => {
    if (!galleryProduct) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleGalleryEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleGalleryEscape)
    }
  }, [galleryProduct, handleGalleryEscape])

  useEffect(() => {
    function handleWindowScroll() {
      setIsScrollTopButtonVisible(window.scrollY > SCROLL_TOP_VISIBILITY_THRESHOLD_PX)
    }

    handleWindowScroll()
    window.addEventListener('scroll', handleWindowScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleWindowScroll)
    }
  }, [])

  function clearFilters() {
    setFilters(INITIAL_FILTERS)
  }

  function toggleAdvancedSearch() {
    setIsAdvancedSearchExpanded((currentValue) => {
      if (currentValue) {
        setFilters((currentFilters) => clearAdvancedOnlyFilters(currentFilters))
      }

      return !currentValue
    })
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function restoreSeedData() {
    startTransition(() => {
      setProducts(seedProducts)
      setFilters(INITIAL_FILTERS)
      setCatalogSummary(SEED_SUMMARY)
    })
    closeGallery()
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

      closeGallery()
      setFeedback(buildImportMessage(nextSummary))
    } catch {
      setErrorMessage(
        'The selected files could not be parsed. Please export the product list HTML again and retry.',
      )
    } finally {
      event.target.value = ''
    }
  }

  function renderCompactImageCell(product: Product) {
    return (
      <div className="thumb-stack">
        {product.imageUrls.map((imageUrl, imageIndex) => (
          <button
            key={`${product.sku}-${imageUrl}`}
            aria-haspopup="dialog"
            aria-label={`View image ${imageIndex + 1} of ${product.imageUrls.length} for ${product.name}`}
            className="thumb-link thumb-link--stack"
            type="button"
            onClick={() => openGallery(product, imageIndex)}
          >
            <img
              alt={product.imageUrls.length === 1 ? product.name : `${product.name} image ${imageIndex + 1}`}
              className="product-thumb product-thumb--compact"
              height={52}
              loading="lazy"
              src={imageUrl}
              width={52}
            />
          </button>
        ))}
      </div>
    )
  }

  function renderAdvancedImageCell(product: Product) {
    return (
      <button
        aria-haspopup="dialog"
        aria-label={`View images for ${product.name}`}
        className="thumb-link"
        type="button"
        onClick={() => openGallery(product)}
      >
        <img
          alt={product.name}
          className="product-thumb"
          height={68}
          loading="lazy"
          src={getPrimaryImageUrl(product)}
          width={68}
        />
      </button>
    )
  }

  return (
    <main className="catalog-shell">
      <section className="catalog-disclosure">
        <button
          aria-controls="catalog-info-panel"
          aria-expanded={isCatalogInfoExpanded}
          className="disclosure-toggle"
          type="button"
          onClick={() => setIsCatalogInfoExpanded((currentValue) => !currentValue)}
        >
          <span className="disclosure-toggle__copy">
            <span className="disclosure-toggle__eyebrow">Catalog Info</span>
            <span className="disclosure-toggle__title">
              {isCatalogInfoExpanded
                ? 'Hide catalog summary and actions'
                : 'Show catalog summary and actions'}
            </span>
          </span>
          <span className="disclosure-toggle__state" aria-hidden="true">
            {isCatalogInfoExpanded ? '-' : '+'}
          </span>
        </button>

        {isCatalogInfoExpanded ? (
          <div id="catalog-info-panel" className="catalog-disclosure__content">
            <section className="hero-panel">
              <div className="hero-panel__copy">
                <p className="eyebrow">Minh &amp; Brothers Product Index</p>
                <h1>One catalog for every exported product page.</h1>
                <p className="hero-panel__lede">
                  Search by name or SKU, slice the list by Type, HS Name, or Category, and
                  reload future HTML exports without leaving the page.
                </p>
              </div>

              <div aria-label="Catalog summary" className="hero-panel__stats">
                <StatCard
                  detail={`Filtered from ${products.length.toLocaleString('en-US')} loaded products`}
                  label="Visible Products"
                  value={filteredProducts.length.toLocaleString('en-US')}
                />
                <StatCard
                  detail={`${catalogSummary.fileCount} file${catalogSummary.fileCount === 1 ? '' : 's'} in the active snapshot`}
                  label="Catalog Source"
                  value={catalogSummary.fileCount.toString()}
                />
                <StatCard
                  detail="Distinct Type, HS Name, and Category values"
                  label="Open Facets"
                  value={(typeOptions.length + hsNameOptions.length + categoryOptions.length).toString()}
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
                  accept=".html,text/html"
                  className="sr-only"
                  id="catalog-import"
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
          </div>
        ) : null}
      </section>

      {(feedback || errorMessage || isPending) && (
        <section aria-live="polite" className="status-row">
          {isPending ? <p className="status-pill">Refreshing catalog...</p> : null}
          {feedback ? <p className="status-pill status-pill--success">{feedback}</p> : null}
          {errorMessage ? <p className="status-pill status-pill--error">{errorMessage}</p> : null}
        </section>
      )}

      <section aria-label="Product filters" className="filters-panel">
        <div className="filters-panel__header">
          <div>
            <p className="eyebrow">Filters</p>
            <h2>Refine the catalog in place.</h2>
          </div>
          <p className="filters-panel__hint">
            Text filters use substring matching. Facets use exact matches and combine together
            with AND logic.
          </p>
        </div>

        <div className="filters-panel__controls">
          <label className="filter-field filter-field--basic filter-field--inline">
            <span>SKU</span>
            <input
              name="skuQuery"
              placeholder="Search by SKU"
              type="search"
              value={filters.skuQuery}
              onChange={(event) => updateFilter('skuQuery', event.target.value)}
            />
          </label>

          <button
            aria-controls="advanced-search-panel"
            aria-expanded={isAdvancedSearchExpanded}
            className="button button--ghost filters-panel__toggle"
            type="button"
            onClick={toggleAdvancedSearch}
          >
            {isAdvancedSearchExpanded ? 'Hide Advanced Search' : 'Show Advanced Search'}
          </button>
        </div>

        {isAdvancedSearchExpanded ? (
          <div id="advanced-search-panel" className="filters-panel__advanced">
            <div className="filters-grid filters-grid--advanced">
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
          </div>
        ) : null}
      </section>

      <section aria-label="Filtered product results" className="table-panel">
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
          <table
            className={`product-table${isCompactTable ? ' product-table--compact' : ' product-table--advanced'}`}
          >
            <thead>
              <tr>
                <th scope="col">Image</th>
                <th scope="col">SKU</th>
                <th scope="col">Tên</th>
                {!isCompactTable ? (
                  <>
                    <th scope="col">Type</th>
                    <th scope="col">HS Name</th>
                    <th scope="col">HS Code</th>
                    <th scope="col">Category</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td className="product-table__empty" colSpan={visibleTableColumnCount}>
                    No products match the current filters.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.sku} className="catalog-row">
                    <td>
                      {isCompactTable
                        ? renderCompactImageCell(product)
                        : renderAdvancedImageCell(product)}
                    </td>
                    <td className="product-table__sku">
                      <code>{product.sku}</code>
                    </td>
                    <td className="product-table__name">{product.name}</td>
                    {!isCompactTable ? (
                      <>
                        <td>{product.type || UNASSIGNED_LABEL}</td>
                        <td>{product.hsName || UNASSIGNED_LABEL}</td>
                        <td>{product.hsCode || '-'}</td>
                        <td>{product.category || UNASSIGNED_LABEL}</td>
                      </>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isScrollTopButtonVisible ? (
        <button
          aria-label="Scroll to top"
          className="scroll-top-button"
          type="button"
          onClick={scrollToTop}
        >
          Top
        </button>
      ) : null}

      {galleryProduct ? (
        <ImageGallery
          product={galleryProduct}
          selectedImageIndex={selectedImageIndex}
          onClose={closeGallery}
          onSelectImage={setSelectedImageIndex}
        />
      ) : null}
    </main>
  )
}

export default App
