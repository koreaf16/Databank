SELECT wr.REPORT_ID   AS "id",
       wr.TEAM_ID     AS "teamId",
       d.DEPT_NAME    AS "teamName",
       TO_CHAR(wr.WEEK_START, 'YYYY-MM-DD') AS "weekStart",
       TO_CHAR(wr.WEEK_END,   'YYYY-MM-DD') AS "weekEnd",
       wr.STATUS      AS "status",
       wr.CREATED_BY  AS "createdBy",
       wr.TEMPLATE_ID AS "templateId",
       wr.PAYLOAD     AS "payload"
FROM WEEKLY_REPORTS wr
LEFT JOIN DEPARTMENTS d ON d.DEPT_ID = wr.TEAM_ID
