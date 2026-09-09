"use client"

import { createContext, useContext } from "react"

/** Carries message associations through Controller and compound field wrappers. */
export const FieldMessageContext = createContext<{ messageId?: string; invalid?: boolean }>({})
export function useFieldMessage() {
  return useContext(FieldMessageContext)
}
