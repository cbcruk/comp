import { Banner } from '@astryxdesign/core/Banner'
import { VStack } from '@astryxdesign/core/VStack'
import type { ComponentPropsWithoutRef, JSX } from 'react'
import { mergeProps } from '../merge-props/merge-props.js'
import type { Toast } from './toast-store.js'

export interface ToastsProps extends ComponentPropsWithoutRef<'div'> {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

/**
 * The active notifications, with a dismiss control each. Presentational — the
 * store decides what is showing and for how long.
 *
 * A banner rather than the design system's own toast, because that one is
 * driven by its own provider and queue; the queue here is `useToasts`, and two
 * things deciding what is on screen is one too many.
 */
export function Toasts({
  toasts,
  onDismiss,
  ...rest
}: ToastsProps): JSX.Element {
  return (
    <VStack
      gap={2}
      {...mergeProps<ComponentPropsWithoutRef<'div'>>(
        { role: 'region', 'aria-label': 'Notifications' },
        rest,
      )}
    >
      {toasts.map((toast) => (
        <Banner
          key={toast.id}
          status={toast.kind}
          title={toast.message}
          data-kind={toast.kind}
          role="status"
          isDismissable
          dismissLabel="Dismiss notification"
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </VStack>
  )
}
