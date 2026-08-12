# Tax rule governance for MY, SG, AU and ID

LedgerVoice must not treat a country name as a complete tax computation. Entity structure, tax residency, assessment year, indirect taxes, withholding taxes, treaties, incentives, capital allowances, losses and filing basis can change the result.

## Activation process

1. Define one jurisdiction, entity type and tax year.
2. Collect current primary guidance from the relevant tax authority.
3. Have a qualified practitioner in that jurisdiction translate it into a deterministic, testable rule set.
4. Record official source URLs, effective dates, reviewer and review date.
5. Test normal cases, thresholds, edge cases and prior-year comparisons.
6. Obtain written approval.
7. Create a new `tax_rule_sets` version and set only the approved version active.
8. Keep old versions for historical reproducibility.
9. Monitor law/budget changes and set review dates.

## Product wording

Allowed wording:

- planning estimate;
- likely review category;
- supporting evidence may be required;
- professional review required.

Avoid:

- guaranteed deduction;
- fully compliant in four countries;
- automatic tax optimisation;
- final tax payable;
- automatic filing.

## Source registers

- Malaysia: [HASiL](https://www.hasil.gov.my/)
- Singapore: [IRAS](https://www.iras.gov.sg/)
- Australia: [ATO](https://www.ato.gov.au/)
- Indonesia: [DJP](https://pajak.go.id/)

Tax sources and rates must be verified again for the actual launch date, entity type and tax year.
