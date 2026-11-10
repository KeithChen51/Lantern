-- Anonymous daily totals survive expiry of the identifying 180-day visit facts.
-- Existing histories are not blindly backfilled: maintenance only saves a day
-- while its complete fact count still matches the independent module PV total.
CREATE TABLE `analytics_daily_visitors` (
  `day` DATE NOT NULL,
  `visitors` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
