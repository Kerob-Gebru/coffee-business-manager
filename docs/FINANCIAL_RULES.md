# Financial data rules

1. Record transaction date and system entry timestamp separately. Historical paper records may be entered later.
2. Store decimal monetary values, original currency and the exchange rate snapshot used on the transaction date.
3. Do not calculate a combined total across currencies without converting to a selected reporting currency using recorded rates.
4. Track cash and each bank account independently. Internal transfers are not income/expense.
5. Support partial payments by allocating each payment to one or more obligations.
6. Distinguish receivables (others owe the business), payables (business owes others), and loans (separate borrowing/lending agreements).
7. Posted records should be immutable; corrections use reversal/adjustment records with user, timestamp and reason.
8. Pending offline entries are not confirmed server transactions. Use stable client-generated IDs and idempotency checks.
