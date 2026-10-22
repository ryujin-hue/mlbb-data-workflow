# Sources, attribution, and coverage boundaries

Last checked in this research package: 22 October 2026.

## Tournament and pro-match sources

- MLBBDex esports index: https://mlbbdex.com/en/esports
  - Its page identifies tournament records as adapted from Liquipedia, licensed CC BY-SA 3.0. Any redistributed derived data should preserve attribution and comply with the source license and current site terms.
- MLBBDex MSC 2026 page: https://mlbbdex.com/en/esports/msc-2026
- MLBB Analytics hero statistics: https://www.mlbbanalytics.com/heroes
- MLBB Analytics tournament index: https://www.mlbbanalytics.com/esports
- MLBBHub MPL Malaysia S18 statistics: https://mlbbhub.com/mpl/my/stats
- Liquipedia statistics portal: https://liquipedia.net/mobilelegends/Portal:Statistics
- LiTianYeoh historical tournament analysis repository: https://github.com/LiTianYeoh/MLBB_Tournament_Analysis
  - Its README documents a consolidated game dataset dated 2024-05-05. Treat that material as a historical snapshot, not live/current coverage.

## Hero/game reference data and assets

- Ceplin03 MLBB database repository: https://github.com/Ceplin03/database-mlbb.Mobile-Legends-Bang-Bang
  - Repository README states MIT license; inspect the checked-out LICENSE file and individual assets before redistributing them.

## Non-negotiable integrity rules

1. Never fabricate match IDs, drafts, hero outcomes, pick/ban counts, or win rates.
2. A hero statistics snapshot is not the same as a complete game-by-game dataset.
3. “Games recorded” on an index page is a source's available count, not proof that every game's draft is complete.
4. HTTP 403, 429, unavailable pages, or parse failures must be logged rather than bypassed.
5. Keep retrieval timestamp, URL, response status, and SHA-256 digest for each downloaded source file when available.
6. A 100 MiB threshold is checked against the actual output bytes. The collector does not create padding or duplicate rows to meet it.
