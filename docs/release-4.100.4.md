# Sofia 4.100.4

- Reinitialize navigation controls on every opening of the reused Photos / Memories surface. Back returns to the current parent; X closes to chat.
- Compact continuous three-column gallery with delivery date on each card, star-only favorite toggle with accessible label and pressed state; shorten variant metadata with the source date retained in its tooltip.
- Labeled native dropdowns for photo type and order displayed below their labels, compact filter and selection controls.
- Vertically centered location/readiness status row with equal top and bottom spacing.
- Cache version 41004v3.

## Validation
- 730 automated tests passed; changed JavaScript and inline script syntax checks passed.
- Browser verification: Photos and Memories back/X after repeated reopen, chronological filter switching, three continuous image columns, circular star controls, dropdowns below labels, compact date input, centered status row.
- Final test commit: 14c4a355eaac61ac9657be76f7e93b1a4ee89083 (READY).
- Native iPhone rendering remains a device check.
