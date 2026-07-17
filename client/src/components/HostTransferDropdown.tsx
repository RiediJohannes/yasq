import { useSignal } from "@preact/signals";

import { auth, discordSdk, gameState, participants } from "../main";
import * as backend from "../utils/backend";
import { getAvatarUrl, getDisplayName } from "@yasq/shared";
import { DiscordAvatar } from "./DiscordAvatar";

export const HostTransferDropdown = () => {
  const isOpen = useSignal(false);
  const selectedPlayer = useSignal<{id: string, name: string, avatar: string} | null>(null);
  const isTransferring = useSignal(false);

  const players = participants.value.filter(p => p.id !== gameState.value.hostId);

  const performTransfer = async () => {
    if (!selectedPlayer.value) return;
    isTransferring.value = true;
    try {
      await backend.assignNewHost(auth.value.access_token, discordSdk.instanceId, selectedPlayer.value.id);
    } catch (e) {
      console.error(e);
    }

    setTimeout(() => {
      isTransferring.value = false;
      selectedPlayer.value = null;
    }, 2000);
  };

  return (
    <div className="setting-item">
      <label htmlFor="host-dropdown" className="setting-label"><span>Transfer Host</span></label>
      <div className="transfer-controls-row">

        <div className="custom-dropdown" id="host-dropdown">
          <button
            type="button"
            className="dropdown-header"
            aria-haspopup="listbox"
            aria-expanded={isOpen.value}
            onClick={() => isOpen.value = !isOpen.value}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === " " || e.key === "Enter") {
                e.preventDefault();
                isOpen.value = true;
                // Move focus to the first item in the list asynchronously once rendered
                setTimeout(() => {
                  const firstItem = document.querySelector(".dropdown-item") as HTMLElement;
                  firstItem?.focus();
                }, 0);
              }
            }}
          >
            {selectedPlayer.value ? (
              <><DiscordAvatar
                src={selectedPlayer.value.avatar}
                userName={selectedPlayer.value.name}
                tiny={true}
              />
                <span>{selectedPlayer.value.name}</span></>
            ) : "Select a player..."}
          </button>

          {isOpen.value && (
            <div
              className="dropdown-list"
              id="dropdown-list"
              style={{ display: 'block' }}
              role="listbox"
            >
              {players.length === 0 ? (
                <div className="dropdown-item dropdown-item-empty" tabIndex={0}>No other players</div>
              ) : players.map(p => {
                const selectThisPlayer = () => {
                  selectedPlayer.value = { id: p.id, name: getDisplayName(p), avatar: getAvatarUrl(p) };
                  isOpen.value = false;
                  // Send focus back to the main dropdown button after selecting
                  (document.querySelector(".dropdown-header") as HTMLElement)?.focus();
                };

                return (
                  <div
                    data-id={p.id}
                    key={p.id}
                    className="dropdown-item"
                    role="option"
                    tabIndex={0} // 2. Make each list item focusable
                    onClick={(e) => {
                      e.stopPropagation();
                      selectThisPlayer();
                    }}
                    onKeyDown={(e) => {
                      // 3. Handle list traversal via keys inside the dropdown list
                      const target = e.currentTarget;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectThisPlayer();
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        (target.nextElementSibling as HTMLElement)?.focus();
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (target.previousElementSibling) {
                          (target.previousElementSibling as HTMLElement)?.focus();
                        } else {
                          (document.querySelector(".dropdown-header") as HTMLElement)?.focus();
                        }
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        isOpen.value = false;
                        (document.querySelector(".dropdown-header") as HTMLElement)?.focus();
                      }
                    }}
                  >
                    <DiscordAvatar
                      src={getAvatarUrl(p)}
                      userName={getDisplayName(p)}
                      tiny={true}
                    />
                    <span>{getDisplayName(p)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          id="btn-confirm-transfer"
          disabled={!selectedPlayer.value || isTransferring.value}
          onClick={performTransfer}
        >
          {isTransferring.value ? "Transferring..." : "Transfer"}
        </button>
      </div>
    </div>
  );
};