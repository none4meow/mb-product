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
import { UNASSIGNED_LABEL } from './lib/parseProductsHtml'
import type { FilterState, Product } from './types/catalog'
import type {
  ApplyImportRequest,
  CatalogResponse,
  ImportPreviewRequest,
  ImportPreviewResponse,
  UpdateCatalogProductRequest,
  UpdateCatalogProductResponse,
} from './types/catalogSourceApi'

const FALLBACK_IMAGE_URL = 'https://minhbros.com/upload/product/placeholder.jpg'
const GALLERY_SWIPE_THRESHOLD_PX = 48
const SCROLL_TOP_VISIBILITY_THRESHOLD_PX = 300
const SOURCE_FILE_LABEL = 'src/data/products.initial.json'
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

type CatalogApiClient = {
  previewImport: (request: ImportPreviewRequest) => Promise<ImportPreviewResponse>
  applyImport: (request: ApplyImportRequest) => Promise<CatalogResponse>
  updateProduct: (request: UpdateCatalogProductRequest) => Promise<UpdateCatalogProductResponse>
}

type AppProps = {
  isEditableCatalog?: boolean
  catalogApi?: CatalogApiClient
}

type ImageGalleryProps = {
  product: Product
  selectedImageIndex: number
  onClose: () => void
  onSelectImage: Dispatch<SetStateAction<number>>
}

type ProductEditorSession = {
  originalSku: string
  product: Product
}

type ProductEditorModalProps = {
  session: ProductEditorSession
  isSaving: boolean
  onClose: () => void
  onSave: (originalSku: string, product: Product) => void
}

type SwipeGesture = {
  source: 'pointer' | 'touch'
  startX: number
  startY: number
  hasTriggered: boolean
  pointerId?: number
  touchId?: number
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

function cloneProduct(product: Product): Product {
  return {
    ...product,
    imageUrls: [...product.imageUrls],
  }
}

function createEditorDraft(product: Product): Product {
  const draft = cloneProduct(product)
  return {
    ...draft,
    imageUrls: draft.imageUrls.length > 0 ? draft.imageUrls : [''],
  }
}

function buildCatalogSummary(products: Product[], isEditableCatalog: boolean): CatalogSummary {
  return {
    label: `${isEditableCatalog ? 'Source of truth' : 'Published snapshot'} · ${SOURCE_FILE_LABEL}`,
    fileCount: 1,
    productCount: products.length,
    invalidFiles: [],
  }
}

function buildPreviewMessage(preview: ImportPreviewResponse) {
  const messageParts: string[] = []

  if (preview.newProducts.length > 0) {
    messageParts.push(
      `${preview.newProducts.length} new SKU${preview.newProducts.length === 1 ? '' : 's'}`,
    )
  }

  if (preview.duplicateCandidates.length > 0) {
    messageParts.push(
      `${preview.duplicateCandidates.length} duplicate SKU${preview.duplicateCandidates.length === 1 ? '' : 's'}`,
    )
  }

  if (messageParts.length === 0) {
    return 'Preview loaded. No new or duplicate SKUs were found.'
  }

  return `Preview loaded with ${messageParts.join(' and ')}.`
}

function buildApplyMessage(newProductCount: number, duplicateUpdateCount: number) {
  const messageParts: string[] = []

  if (newProductCount > 0) {
    messageParts.push(
      `${newProductCount} new SKU${newProductCount === 1 ? '' : 's'} added`,
    )
  }

  if (duplicateUpdateCount > 0) {
    messageParts.push(
      `${duplicateUpdateCount} duplicate SKU${duplicateUpdateCount === 1 ? '' : 's'} overwritten`,
    )
  }

  return `Updated ${SOURCE_FILE_LABEL}: ${messageParts.join(' and ')}.`
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const responseText = await response.text()
  const responseBody = responseText ? (JSON.parse(responseText) as { message?: string }) : {}

  if (!response.ok) {
    throw new Error(responseBody.message ?? 'The catalog request failed.')
  }

  return responseBody as T
}

const defaultCatalogApi: CatalogApiClient = {
  previewImport(request) {
    return requestJson<ImportPreviewResponse>('/api/dev/catalog/import-preview', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  },
  applyImport(request) {
    return requestJson<CatalogResponse>('/api/dev/catalog/apply-import', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  },
  updateProduct(request) {
    return requestJson<UpdateCatalogProductResponse>('/api/dev/catalog/product', {
      method: 'PUT',
      body: JSON.stringify(request),
    })
  },
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

function ProductEditorModal({
  session,
  isSaving,
  onClose,
  onSave,
}: ProductEditorModalProps) {
  const [draft, setDraft] = useState(() => createEditorDraft(session.product))

  function updateField(
    key: 'sku' | 'name' | 'type' | 'hsName' | 'hsCode' | 'category',
    value: string,
  ) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [key]: value,
    }))
  }

  function updateImageUrl(index: number, value: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      imageUrls: currentDraft.imageUrls.map((imageUrl, imageIndex) =>
        imageIndex === index ? value : imageUrl,
      ),
    }))
  }

  function addImageUrl() {
    setDraft((currentDraft) => ({
      ...currentDraft,
      imageUrls: [...currentDraft.imageUrls, ''],
    }))
  }

  function removeImageUrl(index: number) {
    setDraft((currentDraft) => {
      const nextImageUrls = currentDraft.imageUrls.filter((_, imageIndex) => imageIndex !== index)

      return {
        ...currentDraft,
        imageUrls: nextImageUrls.length > 0 ? nextImageUrls : [''],
      }
    })
  }

  return (
    <div className="editor-overlay" role="presentation" onClick={onClose}>
      <section
        aria-label={`Edit ${session.product.name}`}
        aria-modal="true"
        className="editor-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="editor-modal__header">
          <div>
            <p className="eyebrow">Local Edit</p>
            <h2>Edit {session.product.sku}</h2>
          </div>
          <button
            aria-label="Close product editor"
            className="gallery-close"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <form
          className="editor-form"
          onSubmit={(event) => {
            event.preventDefault()
            onSave(session.originalSku, draft)
          }}
        >
          <div className="editor-form__grid">
            <label className="filter-field">
              <span>SKU</span>
              <input
                name="sku"
                type="text"
                value={draft.sku}
                onChange={(event) => updateField('sku', event.target.value)}
              />
            </label>

            <label className="filter-field">
              <span>Tên</span>
              <input
                name="name"
                type="text"
                value={draft.name}
                onChange={(event) => updateField('name', event.target.value)}
              />
            </label>

            <label className="filter-field">
              <span>Type</span>
              <input
                name="type"
                type="text"
                value={draft.type}
                onChange={(event) => updateField('type', event.target.value)}
              />
            </label>

            <label className="filter-field">
              <span>HS Name</span>
              <input
                name="hsName"
                type="text"
                value={draft.hsName}
                onChange={(event) => updateField('hsName', event.target.value)}
              />
            </label>

            <label className="filter-field">
              <span>HS Code</span>
              <input
                name="hsCode"
                type="text"
                value={draft.hsCode}
                onChange={(event) => updateField('hsCode', event.target.value)}
              />
            </label>

            <label className="filter-field">
              <span>Category</span>
              <input
                name="category"
                type="text"
                value={draft.category}
                onChange={(event) => updateField('category', event.target.value)}
              />
            </label>
          </div>

          <section className="editor-form__images" aria-label="Image URL editor">
            <div className="editor-form__images-header">
              <div>
                <p className="eyebrow">Images</p>
                <h3>Image URLs</h3>
              </div>
              <button className="button button--ghost" type="button" onClick={addImageUrl}>
                Add Image URL
              </button>
            </div>

            <div className="editor-image-list">
              {draft.imageUrls.map((imageUrl, imageIndex) => (
                <div key={`${session.originalSku}-${imageIndex}`} className="editor-image-row">
                  <img
                    alt={`Preview for image URL ${imageIndex + 1}`}
                    className="editor-image-row__preview"
                    loading="lazy"
                    src={imageUrl.trim() || FALLBACK_IMAGE_URL}
                  />
                  <input
                    aria-label={`Image URL ${imageIndex + 1}`}
                    className="editor-image-row__input"
                    type="url"
                    value={imageUrl}
                    onChange={(event) => updateImageUrl(imageIndex, event.target.value)}
                  />
                  <button
                    aria-label={`Remove image URL ${imageIndex + 1}`}
                    className="button button--ghost editor-image-row__remove"
                    type="button"
                    onClick={() => removeImageUrl(imageIndex)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          <div className="editor-modal__actions">
            <button className="button button--ghost" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="button button--primary" disabled={isSaving} type="submit">
              Save Product
            </button>
          </div>
        </form>
      </section>
    </div>
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
              <img alt="" className="gallery-thumb__image" loading="lazy" src={imageUrl} />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function App({ isEditableCatalog, catalogApi = defaultCatalogApi }: AppProps) {
  const editableCatalog = isEditableCatalog ?? import.meta.env.DEV
  const [products, setProducts] = useState(seedProducts)
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [catalogSummary, setCatalogSummary] = useState(() =>
    buildCatalogSummary(seedProducts, editableCatalog),
  )
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isCatalogInfoExpanded, setIsCatalogInfoExpanded] = useState(false)
  const [isLocalSourceExpanded, setIsLocalSourceExpanded] = useState(false)
  const [isAdvancedSearchExpanded, setIsAdvancedSearchExpanded] = useState(false)
  const [galleryProduct, setGalleryProduct] = useState<Product | null>(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [isScrollTopButtonVisible, setIsScrollTopButtonVisible] = useState(false)
  const [pastedHtml, setPastedHtml] = useState('')
  const [selectedImportFiles, setSelectedImportFiles] = useState<File[]>([])
  const [importPreview, setImportPreview] = useState<ImportPreviewResponse | null>(null)
  const [selectedDuplicateSkus, setSelectedDuplicateSkus] = useState<string[]>([])
  const [editingSession, setEditingSession] = useState<ProductEditorSession | null>(null)
  const [isSourceRequestPending, setIsSourceRequestPending] = useState(false)

  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const deferredNameQuery = useDeferredValue(filters.nameQuery)
  const deferredSkuQuery = useDeferredValue(filters.skuQuery)

  const typeOptions = collectFacetValues(products, 'type')
  const hsNameOptions = collectFacetValues(products, 'hsName')
  const categoryOptions = collectFacetValues(products, 'category')

  const selectedTypes = new Set(filters.types)
  const selectedHsNames = new Set(filters.hsNames)
  const selectedCategories = new Set(filters.categories)
  const selectedDuplicateSkuSet = new Set(selectedDuplicateSkus)
  const isCompactTable = !isAdvancedSearchExpanded
  const visibleTableColumnCount = (isCompactTable ? 3 : 7) + (editableCatalog ? 1 : 0)
  const isBusy = isPending || isSourceRequestPending

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

  function replaceCatalog(nextProducts: Product[]) {
    startTransition(() => {
      setProducts(nextProducts)
      setCatalogSummary(buildCatalogSummary(nextProducts, editableCatalog))
    })
  }

  function resetImportPreview() {
    setImportPreview(null)
    setSelectedDuplicateSkus([])
  }

  function clearSourceInputs() {
    setPastedHtml('')
    setSelectedImportFiles([])
    resetImportPreview()

    if (importFileInputRef.current) {
      importFileInputRef.current.value = ''
    }
  }

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

  function openProductEditor(product: Product) {
    setEditingSession({
      originalSku: product.sku,
      product: cloneProduct(product),
    })
  }

  function closeProductEditor() {
    setEditingSession(null)
  }

  const handleModalEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Escape') {
      return
    }

    if (editingSession) {
      closeProductEditor()
      return
    }

    if (galleryProduct) {
      closeGallery()
    }
  })

  useEffect(() => {
    if (!galleryProduct && !editingSession) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleModalEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleModalEscape)
    }
  }, [editingSession, galleryProduct, handleModalEscape])

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

  function toggleDuplicateSkuSelection(sku: string) {
    setSelectedDuplicateSkus((currentSkus) =>
      currentSkus.includes(sku)
        ? currentSkus.filter((currentSku) => currentSku !== sku)
        : [...currentSkus, sku],
    )
  }

  function handleSelectedImportFiles(event: ChangeEvent<HTMLInputElement>) {
    setSelectedImportFiles(Array.from(event.target.files ?? []))
    resetImportPreview()
    setFeedback(null)
    setErrorMessage(null)
  }

  async function buildUploadedSources() {
    return Promise.all(
      selectedImportFiles.map(async (file) => ({
        name: file.name,
        html: await file.text(),
      })),
    )
  }

  async function handlePreviewImport() {
    if (!editableCatalog) {
      return
    }

    setFeedback(null)
    setErrorMessage(null)

    const uploadedSources = await buildUploadedSources()

    if (!pastedHtml.trim() && uploadedSources.length === 0) {
      setErrorMessage('Paste HTML or upload at least one HTML file before previewing an import.')
      return
    }

    setIsSourceRequestPending(true)

    try {
      const preview = await catalogApi.previewImport({
        pastedHtml,
        uploadedSources,
      })

      setImportPreview(preview)
      setSelectedDuplicateSkus([])

      if (preview.newProducts.length === 0 && preview.duplicateCandidates.length === 0) {
        setErrorMessage('No valid product rows were found in the provided HTML.')
        return
      }

      setFeedback(buildPreviewMessage(preview))
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'The catalog import preview could not be generated.',
      )
    } finally {
      setIsSourceRequestPending(false)
    }
  }

  async function handleApplyImport() {
    if (!editableCatalog || !importPreview) {
      return
    }

    const duplicateUpdates = importPreview.duplicateCandidates
      .filter((candidate) => selectedDuplicateSkuSet.has(candidate.sku))
      .map((candidate) => candidate.incoming)

    if (importPreview.newProducts.length === 0 && duplicateUpdates.length === 0) {
      setErrorMessage('Select at least one duplicate SKU or preview a new SKU before applying changes.')
      return
    }

    setFeedback(null)
    setErrorMessage(null)
    setIsSourceRequestPending(true)

    try {
      const response = await catalogApi.applyImport({
        newProducts: importPreview.newProducts,
        duplicateUpdates,
      })

      replaceCatalog(response.products)
      clearSourceInputs()
      closeGallery()
      setFeedback(buildApplyMessage(importPreview.newProducts.length, duplicateUpdates.length))
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'The catalog source file could not be updated.',
      )
    } finally {
      setIsSourceRequestPending(false)
    }
  }

  async function handleSaveEditedProduct(originalSku: string, product: Product) {
    if (!editableCatalog) {
      return
    }

    setFeedback(null)
    setErrorMessage(null)
    setIsSourceRequestPending(true)

    try {
      const response = await catalogApi.updateProduct({
        originalSku,
        product,
      })

      replaceCatalog(response.products)
      closeGallery()
      closeProductEditor()
      setFeedback(`Saved ${response.product.sku} to ${SOURCE_FILE_LABEL}.`)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'The product could not be saved to the source file.',
      )
    } finally {
      setIsSourceRequestPending(false)
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
                <h1>One catalog for every tracked product.</h1>
                <p className="hero-panel__lede">
                  Search by SKU, open advanced filters only when needed, and review every product
                  image without leaving the catalog table.
                </p>
              </div>

              <div aria-label="Catalog summary" className="hero-panel__stats">
                <StatCard
                  detail={`Filtered from ${products.length.toLocaleString('en-US')} loaded products`}
                  label="Visible Products"
                  value={filteredProducts.length.toLocaleString('en-US')}
                />
                <StatCard
                  detail={`${catalogSummary.fileCount} source file in the active snapshot`}
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
                </p>
              </div>
            </section>
          </div>
        ) : null}
      </section>

      {(feedback || errorMessage || isBusy) && (
        <section aria-live="polite" className="status-row">
          {isBusy ? <p className="status-pill">Working with the catalog source...</p> : null}
          {feedback ? <p className="status-pill status-pill--success">{feedback}</p> : null}
          {errorMessage ? <p className="status-pill status-pill--error">{errorMessage}</p> : null}
        </section>
      )}

      {editableCatalog ? (
        <section aria-label="Catalog source editor" className="source-panel">
          <button
            aria-controls="local-source-panel"
            aria-expanded={isLocalSourceExpanded}
            className="disclosure-toggle source-panel__toggle"
            type="button"
            onClick={() => setIsLocalSourceExpanded((currentValue) => !currentValue)}
          >
            <span className="disclosure-toggle__copy">
              <span className="disclosure-toggle__eyebrow">Local Source</span>
              <span className="disclosure-toggle__title">
                {isLocalSourceExpanded ? 'Hide Local Source' : 'Show Local Source'}
              </span>
            </span>
            <span className="disclosure-toggle__state" aria-hidden="true">
              {isLocalSourceExpanded ? '-' : '+'}
            </span>
          </button>

          {isLocalSourceExpanded ? (
            <div id="local-source-panel" className="source-panel__content">
              <div className="source-panel__header">
                <div>
                  <p className="eyebrow">Local Source</p>
                  <h2>Preview catalog changes before writing them.</h2>
                </div>
                <p className="source-panel__hint">
                  Local dev only. Paste exported HTML or upload saved HTML files, then review new and
                  duplicate SKUs before updating {SOURCE_FILE_LABEL}.
                </p>
              </div>

              <div className="source-panel__grid">
                <label className="filter-field source-panel__field">
                  <span>Paste HTML</span>
                  <textarea
                    aria-label="Paste HTML"
                    className="source-panel__textarea"
                    placeholder="Paste exported HTML here"
                    value={pastedHtml}
                    onChange={(event) => {
                      setPastedHtml(event.target.value)
                      resetImportPreview()
                    }}
                  />
                </label>

                <label className="filter-field source-panel__field">
                  <span>Upload HTML Files</span>
                  <input
                    ref={importFileInputRef}
                    accept=".html,text/html"
                    aria-label="Upload HTML Files"
                    className="source-panel__file-input"
                    multiple
                    type="file"
                    onChange={handleSelectedImportFiles}
                  />
                  <small>
                    {selectedImportFiles.length > 0
                      ? `${selectedImportFiles.length} file${selectedImportFiles.length === 1 ? '' : 's'} selected`
                      : 'Optional: combine uploaded HTML files with the pasted HTML preview.'}
                  </small>
                </label>
              </div>

              <div className="source-panel__actions">
                <button
                  className="button button--primary"
                  disabled={isBusy}
                  type="button"
                  onClick={handlePreviewImport}
                >
                  Preview Import
                </button>
                <button
                  className="button button--ghost"
                  disabled={
                    isBusy ||
                    !importPreview ||
                    (importPreview.newProducts.length === 0 && selectedDuplicateSkus.length === 0)
                  }
                  type="button"
                  onClick={handleApplyImport}
                >
                  Apply to Source
                </button>
              </div>

              {importPreview ? (
                <section aria-label="Import preview results" className="source-preview">
                  <article className="source-preview__card">
                    <h3>New SKUs</h3>
                    {importPreview.newProducts.length > 0 ? (
                      <ul className="source-preview__list">
                        {importPreview.newProducts.map((product) => (
                          <li key={product.sku}>
                            <strong>{product.sku}</strong>
                            <span>{product.name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="source-preview__empty">No new SKUs in this preview.</p>
                    )}
                  </article>

                  <article className="source-preview__card">
                    <h3>Duplicate SKUs</h3>
                    {importPreview.duplicateCandidates.length > 0 ? (
                      <ul className="source-preview__list source-preview__list--duplicates">
                        {importPreview.duplicateCandidates.map((candidate) => (
                          <li key={candidate.sku} className="duplicate-card">
                            <label className="duplicate-card__toggle">
                              <input
                                checked={selectedDuplicateSkuSet.has(candidate.sku)}
                                type="checkbox"
                                onChange={() => toggleDuplicateSkuSelection(candidate.sku)}
                              />
                              <span>Overwrite {candidate.sku}</span>
                            </label>
                            <p>
                              <strong>Existing:</strong> {candidate.existing.name}
                            </p>
                            <p>
                              <strong>Incoming:</strong> {candidate.incoming.name}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="source-preview__empty">No duplicate SKUs need review.</p>
                    )}
                  </article>

                  <article className="source-preview__card">
                    <h3>Invalid Sources</h3>
                    {importPreview.invalidSources.length > 0 ? (
                      <ul className="source-preview__list">
                        {importPreview.invalidSources.map((sourceName) => (
                          <li key={sourceName}>{sourceName}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="source-preview__empty">Every provided source produced product rows.</p>
                    )}
                  </article>
                </section>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Product filters" className="filters-panel">
        <div className="filters-panel__header">
          <div>
            <p className="eyebrow">Filters</p>
            <h2>Refine the catalog in place.</h2>
          </div>

          <div className="filters-panel__header-actions">
            <button className="button button--ghost" type="button" onClick={clearFilters}>
              Clear Filters
            </button>
            <p className="filters-panel__hint">
              Text filters use substring matching. Facets use exact matches and combine together
              with AND logic.
            </p>
          </div>
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
                {editableCatalog ? (
                  <th className="product-table__actions-heading" scope="col">
                    Edit
                  </th>
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
                    {editableCatalog ? (
                      <td className="product-table__actions">
                        <button
                          aria-label={`Edit product ${product.sku}`}
                          className="button button--ghost row-edit-button"
                          type="button"
                          onClick={() => openProductEditor(product)}
                        >
                          Edit
                        </button>
                      </td>
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

      {editingSession ? (
        <ProductEditorModal
          key={editingSession.originalSku}
          isSaving={isSourceRequestPending}
          session={editingSession}
          onClose={closeProductEditor}
          onSave={handleSaveEditedProduct}
        />
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
