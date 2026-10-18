# Seeded accounts

`npm run db:seed -w be` (and every test/e2e DB reset) creates these accounts. Password for all: `Password123!`

| Username | Email | Role | Lands on after login |
|---|---|---|---|
| alice | alice@example.com | customer | /dashboard |
| bob | bob@example.com | customer | /dashboard |
| carol | carol@example.com | customer | /dashboard |
| staff | staff@example.com | staff | /staff/statistics |
| admin | admin@example.com | admin | /admin/users |

Roles live in `users.role` (`customer` default, `staff`, `admin`). Change these passwords in any real deployment.
