-- ═══════════════════════════════════════════════════════════════
-- Sybil payout review — petclaw 치환본 (2026-07-20, 스키마는 당일 pg_dump로 검증)
-- 원본 템플릿: Obsidian Patterns/scripts/sybil-review.sql (Savior of Health 검증)
-- 용도: season_points 정산/TGE 전 스냅샷 심사. 시간 기준 차단 대신 다신호 점수제.
-- ⚠️ 적용 보류: 활성 배포 중인 프로드 DB + Prisma 관리 스키마라 팀 확인 후 실행.
--    실행: sudo -u postgres psql -d petclaw -f sybil-review-petclaw.sql
-- 미충족 선행: 네트워크 지문(ipfp) 미수집 → IP 팬아웃 신호 제외.
--    (원하면 로그인 라우트에 salted-HMAC ipfp 기록 추가 후 신호 복원)
-- ═══════════════════════════════════════════════════════════════

-- 1) 재사용 뷰: 계정별 시빌 리스크 신호
CREATE OR REPLACE VIEW sybil_scores AS
WITH first_touch AS (  -- 유기적 활동의 최초 시점
  SELECT user_id, min(created_at) AS first_act, count(*) AS n_interactions
  FROM pet_interactions GROUP BY user_id
),
play AS (              -- 누적 플레이 시간
  SELECT user_id, COALESCE(sum(minutes),0) AS total_minutes
  FROM play_sessions GROUP BY user_id
),
first_redeem AS (      -- 최초 리워드 사용 시점
  SELECT user_id, min(created_at) AS t FROM reward_redemptions GROUP BY user_id
),
cred_cluster AS (      -- 정확히 같은 credits 잔액 공유 계정 수 (동일 스크립트 지문)
  SELECT credits, count(*) AS accounts_at_credits
  FROM users GROUP BY credits
),
pts_cluster AS (       -- 정확히 같은 season_points 공유 계정 수
  SELECT season_points, count(*) AS accounts_at_points
  FROM users WHERE season_points > 0 GROUP BY season_points
)
SELECT
  u.id, u.wallet_address, u.credits, u.season_points, u.created_at, u.last_active_at,
  COALESCE(ft.n_interactions, 0)                    AS n_interactions,
  COALESCE(p.total_minutes, 0)                      AS total_minutes,
  cc.accounts_at_credits,
  COALESCE(pc.accounts_at_points, 0)                AS accounts_at_points,
  (ft.first_act - u.created_at < interval '60 seconds') AS interact_under_60s,
  (fr.t         - u.created_at < interval '10 minutes') AS redeem_under_10m,
  -- 가중 리스크 점수 (0~6). 어느 하나로 단정하지 않음.
  (
    (CASE WHEN cc.accounts_at_credits >= 500 THEN 2
          WHEN cc.accounts_at_credits >= 100 THEN 1 ELSE 0 END) +
    (CASE WHEN COALESCE(pc.accounts_at_points,0) >= 100 THEN 2
          WHEN COALESCE(pc.accounts_at_points,0) >= 20  THEN 1 ELSE 0 END) +
    (CASE WHEN (ft.first_act - u.created_at < interval '60 seconds') THEN 1 ELSE 0 END) +
    (CASE WHEN u.season_points > 0 AND COALESCE(ft.n_interactions,0) = 0
               AND COALESCE(p.total_minutes,0) = 0 THEN 2 ELSE 0 END) +  -- 무활동 포인트 = 강신호
    (CASE WHEN (fr.t - u.created_at < interval '10 minutes') THEN 1 ELSE 0 END)
  ) AS risk_score
FROM users u
LEFT JOIN first_touch ft ON ft.user_id = u.id
LEFT JOIN play p         ON p.user_id  = u.id
LEFT JOIN first_redeem fr ON fr.user_id = u.id
LEFT JOIN cred_cluster cc ON cc.credits = u.credits
LEFT JOIN pts_cluster pc  ON pc.season_points = u.season_points;

-- 2) 심사 등급 분포 한눈에
--    risk_score >=3 : 지급 보류(고위험) / 1~2 : 조건부(추가 심사) / 0 : 통과
SELECT risk_score, count(*) AS accounts, sum(season_points) AS held_points
FROM sybil_scores GROUP BY risk_score ORDER BY risk_score DESC;

-- 3) 보류 대상 export (지급 whitelist 제외 목록)
-- \copy (SELECT id, wallet_address, season_points, credits, risk_score, accounts_at_credits, accounts_at_points FROM sybil_scores WHERE risk_score >= 3 ORDER BY risk_score DESC, season_points DESC) TO '/tmp/payout_hold.csv' CSV HEADER;
