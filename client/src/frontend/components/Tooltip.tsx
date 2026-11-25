import {
  cloneElement,
  ComponentChildren,
  createContext,
  HTMLAttributes,
  isValidElement,
  RefObject,
  VNode,
} from 'preact';
import { useContext, useEffect, useId, useRef } from 'preact/hooks';

import { LONG_PRESS_MILLIS } from '@yasq/shared';

import {
  activeTooltipContent,
  activeTooltipId,
  adjustTooltipPlacement,
  closeActiveTooltip,
  Placement,
} from '../../utils/exclusiveTooltip';

export { Placement } from '../../utils/exclusiveTooltip';

/**
 * Provide a value to this context in order to constraint the placement of any tooltip inside it to the bounding
 * box of the given HTMLElement.
 */
export const TooltipBoundaryContext = createContext<RefObject<HTMLElement | null> | undefined>(undefined);

interface BaseTooltipProps {
  /** The text content or rich VNode to display in the tooltip */
  text: ComponentChildren;
  /** Optional custom ID. If omitted, useId() generates a unique stable ID */
  id?: string;
  /** Disable tooltip functionality entirely */
  disabled?: boolean;
  /** Where to place the tooltip relative to the target element - if space permits */
  placement?: Placement;
  /** Maximum width of the tooltip body in pixels. Falls back to the stylesheet's default if omitted */
  maxWidthPx?: number;
  /** Custom ref callback to forward to the underlying DOM node */
  elementRef?: (el: HTMLElement | null) => void;
}

interface WithTooltipProps extends BaseTooltipProps {
  /** Single child element extended by the dynamic tooltip */
  children: VNode<any>;
}

export const WithTooltip = ({
  text,
  children,
  id,
  disabled = false,
  placement = Placement.ABOVE,
  maxWidthPx = 220,
  elementRef,
}: WithTooltipProps) => {
  const boundary = useContext(TooltipBoundaryContext);

  const generatedId = useId();
  const targetId = id ?? generatedId;
  const tooltipId = `${targetId}-tooltip`;

  const isTooltipOpen = activeTooltipId.value === tooltipId;
  const deferredToggleTimer = useRef<number | null>(null);

  // Clean-up timer if component unmounts
  useEffect(() => {
    return () => {
      if (deferredToggleTimer.current) window.clearTimeout(deferredToggleTimer.current);
    };
  }, []);

  // Fall back gracefully if disabled or if children are not a valid VNode
  if (disabled || !text || !isValidElement(children)) {
    return children;
  }

  const triggerBoundsFitting = (target: HTMLElement) => {
    adjustTooltipPlacement(target, tooltipId, placement, boundary?.current, maxWidthPx);
  };

  const handleOpen = (target: HTMLElement) => {
    activeTooltipContent.value = text;
    activeTooltipId.value = tooltipId;
    triggerBoundsFitting(target);
  };

  const handleClose = () => {
    if (activeTooltipId.value === tooltipId) {
      closeActiveTooltip();
    }
  };

  const handleToggle = (target: HTMLElement) => {
    if (isTooltipOpen) {
      activeTooltipId.value = null;
      activeTooltipContent.value = null;
    } else {
      activeTooltipContent.value = text;
      activeTooltipId.value = tooltipId;
      triggerBoundsFitting(target);
    }
  };

  // Helper function to abort a deferred tooltip action (abort a long-press)
  const abortDeferredTooltip = () => {
    if (deferredToggleTimer.current) {
      window.clearTimeout(deferredToggleTimer.current);
      deferredToggleTimer.current = null;
    }
  };

  const childProps = children.props || {};
  const childHasOnClick = !!childProps.onClick;

  const ariaText = typeof text === 'string' ? text : 'Element with attached information';

  return cloneElement(children, {
    ...childProps,
    ref: elementRef ?? childProps.ref,
    'data-tooltip': text,
    'aria-describedby': isTooltipOpen ? tooltipId : undefined,
    'aria-label': ariaText,
    id: childProps.id ?? targetId,
    className: `has-tooltip ${isTooltipOpen ? 'show-tooltip' : ''} ${childProps.className || ''}`.trim(),
    // Attach a bunch of event handlers that open/close the added tooltip as expected
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return; // ignore hover events that were merely simulated after a touch event
      childProps.onPointerEnter?.(e);
      handleOpen(e.currentTarget as HTMLElement);
    },
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      childProps.onPointerLeave?.(e);
      handleClose();
    },
    onTouchStart: (e: TouchEvent) => {
      // Do not propagate touch event to parents, otherwise the tooltip is immediately closed again
      // by the window's touchstart handler we attached in exclusiveTooltip.ts
      e.stopPropagation();
      childProps.onTouchStart?.(e);

      const target = e.currentTarget as HTMLElement;
      if (childHasOnClick) {
        // Defer opening the tooltip for the duration of a long-press
        deferredToggleTimer.current = window.setTimeout(() => {
          handleToggle(target);
        }, LONG_PRESS_MILLIS);
      } else {
        handleToggle(target); // otherwise instantly toggle tooltip
      }
    },
    onTouchEnd: (e: TouchEvent) => {
      abortDeferredTooltip();
      childProps.onTouchEnd?.(e);
    },
    onTouchMove: (e: TouchEvent) => {
      abortDeferredTooltip();
      childProps.onTouchMove?.(e);
    },
    onTouchCancel: (e: TouchEvent) => {
      abortDeferredTooltip();
      childProps.onTouchCancel?.(e);
    },
    onClick: (e: MouseEvent) => {
      e.stopPropagation(); // Again, stop bubbling up the event to parents (see onTouchStart handler)
      if (childHasOnClick) {
        handleClose(); // Close tooltip if one was open through a long-press
      }
      childProps.onClick?.(e);
    },
    onFocus: (e: FocusEvent) => {
      childProps.onFocus?.(e);
      handleOpen(e.currentTarget as HTMLElement);
    },
    onBlur: (e: FocusEvent) => {
      childProps.onBlur?.(e);
      handleClose();
    },
    children: [
      childProps.children,
      isTooltipOpen && (
        <span
          id={tooltipId}
          className="tooltip-content"
          key="active-tooltip"
          role="tooltip"
          data-placement={placement}
        >
          {activeTooltipContent.value}
        </span>
      ),
    ],
  });
};

/** Accepts all properties of {@link BaseTooltipProps} and those that an HTML `div` element supports. */
interface TooltipDivProps extends Omit<HTMLAttributes<HTMLDivElement>, keyof BaseTooltipProps>, BaseTooltipProps {
  /** Single child element or inline text wrapped by div with dynamic tooltip */
  children: ComponentChildren;
}

export const TooltipDiv = ({
  text,
  children,
  id,
  disabled,
  placement,
  maxWidthPx,
  className = '',
  tabIndex = 0,
  elementRef,
  ...restProps
}: TooltipDivProps) => {
  return (
    <WithTooltip
      text={text}
      id={id}
      disabled={disabled}
      placement={placement}
      maxWidthPx={maxWidthPx}
      elementRef={elementRef}
    >
      <div
        id={id}
        className={className}
        tabIndex={tabIndex}
        {...restProps}
      >
        <>{children}</>
      </div>
    </WithTooltip>
  );
};
