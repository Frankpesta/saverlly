import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TablePagination } from "./table-pagination"

describe("TablePagination", () => {
  it("renders nothing when everything fits on one page", () => {
    const { container } = render(
      <TablePagination page={1} pageCount={1} totalItems={10} pageSize={25} onPageChange={jest.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("shows the item range and page count once there's more than one page", () => {
    render(<TablePagination page={1} pageCount={2} totalItems={30} pageSize={25} onPageChange={jest.fn()} />)

    expect(screen.getByText("Showing 1-25 of 30")).toBeInTheDocument()
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
  })

  it("disables Previous on the first page and Next on the last page", () => {
    const { rerender } = render(
      <TablePagination page={1} pageCount={2} totalItems={30} pageSize={25} onPageChange={jest.fn()} />,
    )
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled()

    rerender(<TablePagination page={2} pageCount={2} totalItems={30} pageSize={25} onPageChange={jest.fn()} />)
    expect(screen.getByRole("button", { name: /previous/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled()
    expect(screen.getByText("Showing 26-30 of 30")).toBeInTheDocument()
  })

  it("calls onPageChange with the adjacent page when Previous/Next are clicked", async () => {
    const onPageChange = jest.fn()
    render(<TablePagination page={2} pageCount={3} totalItems={75} pageSize={25} onPageChange={onPageChange} />)

    await userEvent.click(screen.getByRole("button", { name: /next/i }))
    expect(onPageChange).toHaveBeenCalledWith(3)

    await userEvent.click(screen.getByRole("button", { name: /previous/i }))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })
})
