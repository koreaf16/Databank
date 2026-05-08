WITH cell_agg AS (
  SELECT PLAN_ID,
         LISTAGG(PERIOD_MONTH || ':' || STATUS || ':' || NVL(HISTORY_ID, ''), ',')
           WITHIN GROUP (ORDER BY PERIOD_MONTH) AS cells_raw
  FROM ROUTINE_PLAN_CELLS
  GROUP BY PLAN_ID
)
SELECT p.PLAN_ID     AS "planId",
       p.CUSTOMER_ID AS "customerId",
       c.CUSTOMER_MAIN AS "customerName",
       p.SERVICE_NAME AS "serviceName",
       p.PERIOD_YEAR  AS "year",
       p.PERIOD_HALF  AS "half",
       p.TARGET_FREQ  AS "targetFreq",
       ca.cells_raw   AS "cellsRaw"
FROM ROUTINE_PLANS p
JOIN CUSTOMERS c ON c.CUSTOMER_ID = p.CUSTOMER_ID
LEFT JOIN cell_agg ca ON ca.PLAN_ID = p.PLAN_ID
