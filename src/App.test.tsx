import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./data/products.initial.json', () => ({
  default: [
    {
      sku: 'D48',
      name: 'Tranh mảnh ghép 2 tầng D48',
      type: 'Wood',
      hsName: 'Plywood decorative sign',
      hsCode: '4411939090',
      category: 'Table Decor',
      imageUrls: [
        'https://minhbros.com/upload/product/1654/9d2682367c3935defcb1f9e247a97c0d69d86c3e469c7.jpg',
      ],
      sourceLabel: 'Products_Page 1.html',
    },
    {
      sku: 'U40',
      name: 'Treo Móng Ngựa U40',
      type: 'Macrame + Wood',
      hsName: 'Macrame Wall Hanging',
      hsCode: '5609004000',
      category: 'Wall Hangings',
      imageUrls: [
        'https://minhbros.com/upload/product/1653/b147a61c1d07c1c999560f62add6dbc769d315f3c15b1.jpg',
      ],
      sourceLabel: 'Products_Page 1.html',
    },
  ],
}))

import App from './App'

const galleryImportFixture = `
  <table>
    <tr>
      <td><a data-toggle="collapse" data-target="#product_6"></a></td>
      <td>
        <a href="/upload/product/mock/gallery-1.jpg">
          <img src="/upload/product/mock/gallery-2.jpg">
        </a>
      </td>
      <td style="vertical-align: middle;">Gallery product</td>
      <td style="vertical-align: middle;">GALLERY-01</td>
      <td style="vertical-align: middle;">Macrame</td>
      <td style="vertical-align: middle;">Macrame Wall Hanging</td>
      <td style="vertical-align: middle;">5609004000</td>
      <td style="vertical-align: middle;">Wall Hangings</td>
      <td></td>
      <td class="text-center"><a href="/edit-product/6">Edit</a></td>
    </tr>
  </table>
`

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 1024px)' ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('App', () => {
  it('renders the first seed image as the table thumbnail', () => {
    render(<App />)

    expect(screen.getByAltText('Tranh mảnh ghép 2 tầng D48')).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/1654/9d2682367c3935defcb1f9e247a97c0d69d86c3e469c7.jpg',
    )
  })

  it('filters by text and exact-match facets, then clears back to the full list', async () => {
    const user = userEvent.setup()

    render(<App />)

    expect(screen.getByText('2 products on screen')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tên'), {
      target: { value: 'Tranh mảnh ghép 2 tầng D48' },
    })
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'D48' } })
    await user.selectOptions(screen.getByLabelText('Type'), ['Wood'])
    await user.selectOptions(screen.getByLabelText('HS Name'), ['Plywood decorative sign'])
    await user.selectOptions(screen.getByLabelText('Category'), ['Table Decor'])

    expect(screen.getByText('Tranh mảnh ghép 2 tầng D48')).toBeInTheDocument()
    expect(screen.getByText('1 products on screen')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear Filters' }))

    expect(screen.getByText('2 products on screen')).toBeInTheDocument()
  })

  it('imports uploaded HTML files and replaces the active catalog', async () => {
    const user = userEvent.setup()

    render(<App />)

    const importInput = screen.getByLabelText('Import HTML Files')
    const importFixture = `
      <table class="table table-striped margintop15">
        <tr>
          <td><a data-toggle="collapse" data-target="#product_1"></a></td>
          <td>
            <a href="/upload/product/mock/import-1.jpg"><img src="/upload/product/mock/import-1.jpg"></a>
          </td>
          <td style="vertical-align: middle;">Đèn mây mini</td>
          <td style="vertical-align: middle;">MINI-01</td>
          <td style="vertical-align: middle;">Macrame</td>
          <td style="vertical-align: middle;">Macrame Wall Hanging</td>
          <td style="vertical-align: middle;">5609004000</td>
          <td style="vertical-align: middle;">Wall Hangings</td>
          <td></td>
          <td class="text-center"><a href="/edit-product/1">Edit</a></td>
        </tr>
      </table>
    `

    await user.upload(
      importInput,
      new File([importFixture], 'Imported_Page.html', { type: 'text/html' }),
    )

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())

    expect(screen.getByText('Đèn mây mini')).toBeInTheDocument()
    expect(screen.getByAltText('Đèn mây mini')).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/import-1.jpg',
    )
    expect(screen.getByText('Imported 1 products from 1 file.')).toBeInTheDocument()
    expect(screen.getByText(/Imported snapshot/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reset to Seed Data' }))

    await waitFor(() => expect(screen.getByText('2 products on screen')).toBeInTheDocument())
  })

  it('opens a modal gallery, shows all product images, switches images, and closes', async () => {
    const user = userEvent.setup()

    render(<App />)

    const importInput = screen.getByLabelText('Import HTML Files')

    await user.upload(
      importInput,
      new File([galleryImportFixture], 'Gallery.html', { type: 'text/html' }),
    )

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())

    await user.click(screen.getByLabelText('View images for Gallery product'))

    const dialog = screen.getByRole('dialog', { name: 'Gallery product images' })
    const mainImage = within(dialog).getByRole('img', { name: 'Gallery product image 1' })
    expect(mainImage).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-1.jpg',
    )

    const galleryButtons = within(dialog).getAllByRole('button', { name: /Show image \d of 2/ })
    expect(galleryButtons).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Show image 2 of 2' }))
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )

    await user.click(screen.getByRole('button', { name: 'Close image gallery' }))
    expect(screen.queryByRole('dialog', { name: 'Gallery product images' })).not.toBeInTheDocument()
  })

  it('swipes left and right for touch-like pointer input on pointermove even when the viewport is wider than 1024px', async () => {
    const user = userEvent.setup()
    setMatchMedia(false)

    render(<App />)

    const importInput = screen.getByLabelText('Import HTML Files')
    await user.upload(
      importInput,
      new File([galleryImportFixture], 'Gallery.html', { type: 'text/html' }),
    )

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())
    await user.click(screen.getByLabelText('View images for Gallery product'))

    const dialog = screen.getByRole('dialog', { name: 'Gallery product images' })
    const currentImage = () => within(dialog).getByRole('img', { name: /Gallery product image/ })

    fireEvent.pointerDown(currentImage(), {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 240,
      clientY: 120,
    })
    fireEvent.pointerMove(currentImage(), {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 120,
      clientY: 120,
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )
    fireEvent.pointerMove(currentImage(), {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 40,
      clientY: 120,
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )
    fireEvent.pointerUp(currentImage(), {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 40,
      clientY: 120,
    })

    fireEvent.pointerDown(currentImage(), {
      pointerId: 2,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 240,
      clientY: 120,
    })
    fireEvent.pointerMove(currentImage(), {
      pointerId: 2,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 120,
      clientY: 120,
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 1' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-1.jpg',
    )
    fireEvent.pointerUp(currentImage(), {
      pointerId: 2,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 120,
      clientY: 120,
    })

    fireEvent.pointerDown(currentImage(), {
      pointerId: 3,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 120,
      clientY: 120,
    })
    fireEvent.pointerMove(currentImage(), {
      pointerId: 3,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 240,
      clientY: 120,
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )
    fireEvent.pointerUp(currentImage(), {
      pointerId: 3,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 240,
      clientY: 120,
    })

    await user.click(screen.getByRole('button', { name: 'Close image gallery' }))
    expect(screen.queryByRole('dialog', { name: 'Gallery product images' })).not.toBeInTheDocument()
  })

  it('swipes left and right for mouse drag input on pc before release', async () => {
    const user = userEvent.setup()
    setMatchMedia(false)

    render(<App />)

    const importInput = screen.getByLabelText('Import HTML Files')
    await user.upload(
      importInput,
      new File([galleryImportFixture], 'Gallery.html', { type: 'text/html' }),
    )

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())
    await user.click(screen.getByLabelText('View images for Gallery product'))

    const dialog = screen.getByRole('dialog', { name: 'Gallery product images' })
    const currentImage = () => within(dialog).getByRole('img', { name: /Gallery product image/ })

    fireEvent.pointerDown(currentImage(), {
      pointerId: 11,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      clientX: 240,
      clientY: 120,
    })
    fireEvent.pointerMove(currentImage(), {
      pointerId: 11,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      clientX: 120,
      clientY: 120,
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )
    fireEvent.pointerUp(currentImage(), {
      pointerId: 11,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      clientX: 120,
      clientY: 120,
    })

    fireEvent.pointerDown(currentImage(), {
      pointerId: 12,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      clientX: 120,
      clientY: 120,
    })
    fireEvent.pointerMove(currentImage(), {
      pointerId: 12,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      clientX: 240,
      clientY: 120,
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 1' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-1.jpg',
    )
    fireEvent.pointerUp(currentImage(), {
      pointerId: 12,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      clientX: 240,
      clientY: 120,
    })
  })

  it('supports touch-event fallback swipes on touchmove and loops at the image list ends', async () => {
    const user = userEvent.setup()
    setMatchMedia(false)

    render(<App />)

    const importInput = screen.getByLabelText('Import HTML Files')
    await user.upload(
      importInput,
      new File([galleryImportFixture], 'Gallery.html', { type: 'text/html' }),
    )

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())
    await user.click(screen.getByLabelText('View images for Gallery product'))

    const dialog = screen.getByRole('dialog', { name: 'Gallery product images' })
    const currentImage = () => within(dialog).getByRole('img', { name: /Gallery product image/ })

    fireEvent.touchStart(currentImage(), {
      changedTouches: [{ identifier: 5, clientX: 240, clientY: 120 }],
      touches: [{ identifier: 5, clientX: 240, clientY: 120 }],
    })
    fireEvent.touchMove(currentImage(), {
      changedTouches: [{ identifier: 5, clientX: 120, clientY: 120 }],
      touches: [{ identifier: 5, clientX: 120, clientY: 120 }],
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )
    fireEvent.touchMove(currentImage(), {
      changedTouches: [{ identifier: 5, clientX: 40, clientY: 120 }],
      touches: [{ identifier: 5, clientX: 40, clientY: 120 }],
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )
    fireEvent.touchEnd(currentImage(), {
      changedTouches: [{ identifier: 5, clientX: 40, clientY: 120 }],
    })

    fireEvent.touchStart(currentImage(), {
      changedTouches: [{ identifier: 6, clientX: 240, clientY: 120 }],
      touches: [{ identifier: 6, clientX: 240, clientY: 120 }],
    })
    fireEvent.touchMove(currentImage(), {
      changedTouches: [{ identifier: 6, clientX: 120, clientY: 120 }],
      touches: [{ identifier: 6, clientX: 120, clientY: 120 }],
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 1' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-1.jpg',
    )
    fireEvent.touchEnd(currentImage(), {
      changedTouches: [{ identifier: 6, clientX: 120, clientY: 120 }],
    })

    fireEvent.touchStart(currentImage(), {
      changedTouches: [{ identifier: 7, clientX: 120, clientY: 120 }],
      touches: [{ identifier: 7, clientX: 120, clientY: 120 }],
    })
    fireEvent.touchMove(currentImage(), {
      changedTouches: [{ identifier: 7, clientX: 240, clientY: 120 }],
      touches: [{ identifier: 7, clientX: 240, clientY: 120 }],
    })
    expect(within(dialog).getByRole('img', { name: 'Gallery product image 2' })).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-2.jpg',
    )
    fireEvent.touchEnd(currentImage(), {
      changedTouches: [{ identifier: 7, clientX: 240, clientY: 120 }],
    })
  })

  it('ignores short or mostly vertical swipe gestures on touch input during move', async () => {
    const user = userEvent.setup()
    setMatchMedia(false)

    render(<App />)

    const importInput = screen.getByLabelText('Import HTML Files')
    await user.upload(
      importInput,
      new File([galleryImportFixture], 'Gallery.html', { type: 'text/html' }),
    )

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())
    await user.click(screen.getByLabelText('View images for Gallery product'))

    const dialog = screen.getByRole('dialog', { name: 'Gallery product images' })
    const mainImage = () => within(dialog).getByRole('img', { name: 'Gallery product image 1' })

    fireEvent.pointerDown(mainImage(), {
      pointerId: 2,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 220,
      clientY: 120,
    })
    fireEvent.pointerMove(mainImage(), {
      pointerId: 2,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 190,
      clientY: 124,
    })
    expect(mainImage()).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-1.jpg',
    )
    fireEvent.pointerUp(mainImage(), {
      pointerId: 2,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 190,
      clientY: 124,
    })

    fireEvent.pointerDown(mainImage(), {
      pointerId: 3,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 220,
      clientY: 120,
    })
    fireEvent.pointerMove(mainImage(), {
      pointerId: 3,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 150,
      clientY: 240,
    })
    expect(mainImage()).toHaveAttribute(
      'src',
      'https://minhbros.com/upload/product/mock/gallery-1.jpg',
    )
    fireEvent.pointerUp(mainImage(), {
      pointerId: 3,
      isPrimary: true,
      pointerType: 'touch',
      clientX: 150,
      clientY: 240,
    })
  })

  it('shows a non-blocking error message for unrelated HTML', async () => {
    const user = userEvent.setup()

    render(<App />)

    const importInput = screen.getByLabelText('Import HTML Files')

    await user.upload(
      importInput,
      new File(['<html><body><h1>No product table</h1></body></html>'], 'Bad.html', {
        type: 'text/html',
      }),
    )

    expect(
      await screen.findByText('No valid product rows were found in the selected HTML files.'),
    ).toBeInTheDocument()
    expect(screen.getByText('2 products on screen')).toBeInTheDocument()
  })

  it('reports skipped invalid files while keeping valid imports', async () => {
    const user = userEvent.setup()

    render(<App />)

    const importInput = screen.getByLabelText('Import HTML Files')
    const validImport = `
      <table>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_2"></a></td>
          <td><a href="/upload/product/mock/import-2.jpg"><img src="/upload/product/mock/import-2.jpg"></a></td>
          <td style="vertical-align: middle;">Khung ảnh hoa</td>
          <td style="vertical-align: middle;">FRAME-02</td>
          <td style="vertical-align: middle;">Wood</td>
          <td style="vertical-align: middle;">photo frame</td>
          <td style="vertical-align: middle;">4414</td>
          <td style="vertical-align: middle;">Table Decor</td>
          <td></td>
          <td class="text-center"><a href="/edit-product/2">Edit</a></td>
        </tr>
      </table>
    `

    await user.upload(importInput, [
      new File([validImport], 'Good.html', { type: 'text/html' }),
      new File(['<html></html>'], 'Bad.html', { type: 'text/html' }),
    ])

    const sourcePanel = screen.getByText(/Imported snapshot/).closest('.toolbar-panel')
    expect(await screen.findByText(/skipped 1 invalid file/)).toBeInTheDocument()
    expect(sourcePanel).not.toBeNull()

    const panel = sourcePanel instanceof HTMLElement ? sourcePanel : document.body
    expect(within(panel).getByText(/1 skipped/)).toBeInTheDocument()
  })

  it('keeps the first imported row when later files contain the same SKU', async () => {
    const user = userEvent.setup()

    render(<App />)

    const importInput = screen.getByLabelText('Import HTML Files')
    const firstImport = `
      <table>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_3"></a></td>
          <td><a href="/upload/product/mock/first-file.jpg"><img src="/upload/product/mock/first-file.jpg"></a></td>
          <td style="vertical-align: middle;">First file product</td>
          <td style="vertical-align: middle;">DUP-02</td>
          <td style="vertical-align: middle;">Wood</td>
          <td style="vertical-align: middle;">Decor</td>
          <td style="vertical-align: middle;">1111</td>
          <td style="vertical-align: middle;">Table Decor</td>
          <td></td>
          <td class="text-center"><a href="/edit-product/3">Edit</a></td>
        </tr>
      </table>
    `
    const secondImport = `
      <table>
        <tr>
          <td><a data-toggle="collapse" data-target="#product_4"></a></td>
          <td><a href="/upload/product/mock/second-file.jpg"><img src="/upload/product/mock/second-file.jpg"></a></td>
          <td style="vertical-align: middle;">Second file product</td>
          <td style="vertical-align: middle;">DUP-02</td>
          <td style="vertical-align: middle;">Glass</td>
          <td style="vertical-align: middle;">Alt Decor</td>
          <td style="vertical-align: middle;">2222</td>
          <td style="vertical-align: middle;">Wall Hangings</td>
          <td></td>
          <td class="text-center"><a href="/edit-product/4">Edit</a></td>
        </tr>
      </table>
    `

    await user.upload(importInput, [
      new File([firstImport], 'First.html', { type: 'text/html' }),
      new File([secondImport], 'Second.html', { type: 'text/html' }),
    ])

    await waitFor(() => expect(screen.getByText('1 products on screen')).toBeInTheDocument())

    expect(screen.getByText('First file product')).toBeInTheDocument()
    expect(screen.queryByText('Second file product')).not.toBeInTheDocument()
    expect(screen.getByText('Imported 1 products from 2 files.')).toBeInTheDocument()
  })
})
