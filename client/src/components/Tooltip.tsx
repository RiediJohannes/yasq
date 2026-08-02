import { useEffect, useId, useRef } from 'preact/hooks';
import { cloneElement, HTMLAttributes, isValidElement, VNode } from 'preact';
import { activeTooltipId, measureBounds } from '../utils/exclusiveTooltip';
import { ReactNode } from 'preact/compat';

interface WithTooltipProps extends HTMLAttributes<HTMLDivElement> {
  /** The text content to display in the tooltip */
  text: string;
  /** Single child element extended by the dynamic tooltip */
  children: VNode<any>;
  /** Optional custom ID. If omitted, useId() generates a unique stable ID */
  id?: string;
  /** Disable tooltip functionality entirely */
  disabled?: boolean;
}

export const WithTooltip = ({ text, children, id, disabled = false }: WithTooltipProps) => {
  // Fall back gracefully if disabled or if children is not a valid VNode
  if (disabled || !text || !isValidElement(children)) {
    return children;
  }

  const LONG_PRESS_MILLIS = 400;
  const generatedId = useId();
  const tooltipId = id ?? generatedId;

  const isTooltipOpen = activeTooltipId.value === tooltipId;
  const deferredToggleTimer = useRef<number | null>(null);

  // Clean-up timer if component unmounts
  useEffect(() => {
    return () => {
      if (deferredToggleTimer.current) window.clearTimeout(deferredToggleTimer.current);
    };
  }, []);

  const handleOpen = (el: HTMLElement) => {
    measureBounds(el);
    activeTooltipId.value = tooltipId;
  };

  const handleClose = () => {
    if (activeTooltipId.value === tooltipId) {
      activeTooltipId.value = null;
    }
  };

  const handleToggle = (el: HTMLElement) => {
    measureBounds(el);
    activeTooltipId.value = isTooltipOpen ? null : tooltipId;
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

  return cloneElement(children, {
    'data-tooltip': text,
    className: `has-tooltip ${isTooltipOpen ? 'show-tooltip' : ''} ${childProps.className || ''}`.trim(),
    // Attach a bunch of event handlers that open/close the added tooltip as expected
    onMouseEnter: (e: MouseEvent) => {
      childProps.onMouseEnter?.(e);
      handleOpen(e.currentTarget as HTMLElement);
    },
    onMouseLeave: (e: MouseEvent) => {
      childProps.onMouseLeave?.(e);
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
  });
};

interface TooltipDivProps {
  /** The text content to display in the tooltip */
  text: string;
  /** Single child element or inline text wrapped by div with dynamic tooltip */
  children: ReactNode;
  /** Optional custom ID. If omitted, useId() generates a unique stable ID */
  id?: string;
  /** Disable tooltip functionality entirely */
  disabled?: boolean;
  className?: string;
}

export const TooltipDiv = ({ text, children, id, disabled = false, className = '' }: TooltipDivProps) => {
  return (
    <WithTooltip
      text={text}
      id={id}
      disabled={disabled}
    >
      <div className={`${className}`}>{children}</div>
    </WithTooltip>
  );
};
