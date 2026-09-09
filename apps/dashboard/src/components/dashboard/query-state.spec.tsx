import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryBoundary } from "./query-state"

it("keeps unconfirmed zero values out of a loading or failed dashboard and retries failed queries", async () => {
  const retry = jest.fn()
  const successfulRetry = jest.fn()
  const successful = { isLoading: false, isError: false, refetch: successfulRetry }
  const { rerender } = render(
    <QueryBoundary label="earnings" queries={[{ isLoading: true, isError: false, refetch: retry }]}>
      <p>Balance: $0.00</p>
    </QueryBoundary>,
  )
  expect(screen.getByRole("status", { name: "Loading earnings" })).toBeInTheDocument()
  expect(screen.queryByText("Balance: $0.00")).not.toBeInTheDocument()
  rerender(
    <QueryBoundary
      label="earnings"
      queries={[successful, { isLoading: false, isError: true, refetch: retry }]}
    >
      <p>Balance: $0.00</p>
    </QueryBoundary>,
  )
  expect(screen.getByRole("alert")).toHaveTextContent("Could not load earnings")
  expect(screen.queryByText("Balance: $0.00")).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Try again" }))
  expect(retry).toHaveBeenCalledTimes(1)
  expect(successfulRetry).not.toHaveBeenCalled()
  rerender(
    <QueryBoundary label="earnings" queries={[successful]}>
      <p>Balance: $0.00</p>
    </QueryBoundary>,
  )
  expect(screen.getByText("Balance: $0.00")).toBeInTheDocument()
})
