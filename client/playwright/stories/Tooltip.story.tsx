import { useState } from 'preact/hooks';
import { TooltipDiv, WithTooltip } from '@components/Tooltip';
import { TargetedKeyboardEvent } from 'preact';

export const WrapBasicChild = () => (
  <div id="direct-parent">
    <WithTooltip
      text="Helpful information"
      id="test-tooltip"
    >
      <div tabIndex={0}>Hover or focus me</div>
    </WithTooltip>
  </div>
);

export const WrapInteractiveChild = () => {
  const [clicks, setClicks] = useState<number>(0);

  return (
    <div id="direct-parent">
      <WithTooltip
        text="Action tooltip"
        id="test-tooltip"
      >
        <button
          id="tooltip-child"
          onClick={_ => setClicks((prev: number) => prev + 1)}
        >
          Click me
        </button>
      </WithTooltip>

      {/* Clicks tracker for Playwright assertions */}
      <output id="click-count">{clicks}</output>
    </div>
  );
};

export const Disabled = () => (
  <TooltipDiv
    text="Never shown"
    id="disabled-tooltip"
    disabled
  >
    <div tabIndex={0}>Disabled tooltip</div>
  </TooltipDiv>
);

export const EscapeCounter = () => {
  const [escapes, setEscapes] = useState(0);
  const countEscapeEvents = (e: TargetedKeyboardEvent<HTMLDivElement>) => e.key === 'Escape' && setEscapes(n => n + 1);

  return (
    <div
      id="direct-parent"
      onKeyDown={countEscapeEvents}
    >
      <WithTooltip
        text="Close me by hitting ESC"
        id="test-tooltip"
      >
        <div tabIndex={0}>Hover or focus me</div>
      </WithTooltip>
      <output id="escape-count">{escapes}</output>
    </div>
  );
};

export const DivAroundText = () => (
  <div id="direct-parent">
    <TooltipDiv
      text="Helpful information"
      id="test-tooltip"
    >
      Hover or focus me
    </TooltipDiv>
  </div>
);

export const DivAroundHierarchy = () => {
  const [clicks, setClicks] = useState<number>(0);

  return (
    <div id="direct-parent">
      <TooltipDiv
        text="Helpful information"
        id="test-tooltip"
      >
        <div id="tooltip-child-1">
          <button
            id="nested-button"
            onClick={_ => setClicks((prev: number) => prev + 1)}
          >
            Press me
          </button>
          <span>Description next to the button</span>
        </div>
        <div id="tooltip-child-2">
          <output id="click-count">{clicks}</output>
        </div>
      </TooltipDiv>
    </div>
  );
};

export const MultipleTooltips = () => {
  const [clicks, setClicks] = useState<number>(0);

  return (
    <div className="flex-col gap-large">
      <div className="flex-row gap-med">
        <TooltipDiv
          text="First message"
          id="tooltip-1"
          tabIndex={0}
        >
          First Child
        </TooltipDiv>
        <WithTooltip
          text="Second message"
          id="tooltip-2"
        >
          <span tabIndex={0}>Second Child</span>
        </WithTooltip>
        <WithTooltip
          text="Third message"
          id="tooltip-3"
        >
          <button onClick={_ => setClicks((prev: number) => prev + 1)}>Third Child</button>
        </WithTooltip>
      </div>
      <output id="click-count">{clicks}</output>
    </div>
  );
};

export const BoundaryTest = () => {
  const longText = 'This is an unnecessarily long tooltip text designed specifically to overflow the viewport.';

  return (
    <>
      <TooltipDiv
        id="tooltip-left"
        text={longText}
        style={{ position: 'absolute', top: '10px', left: '10px' }}
      >
        Top Left
      </TooltipDiv>
      <TooltipDiv
        id="tooltip-right"
        text={longText}
        style={{ position: 'absolute', top: '10px', right: '10px' }}
      >
        Top Right
      </TooltipDiv>
    </>
  );
};
