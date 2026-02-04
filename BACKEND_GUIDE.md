# 517 VIP Suites & Apartments - Backend API Documentation

## Overview

This backend powers the hotel booking platform with:
- MySQL database via Sequelize ORM
- Auth endpoints for demo guest/admin access
- Suites/apartments inventory management
- Availability search
- Booking and payment flows
- Payment gateway abstraction for Paystack and Flutterwave

## Stack

- Node.js + Express + TypeScript
- MySQL + Sequelize
- JWT authentication
- Cloudinary (media storage)
- Paystack + Flutterwave (payment integrations)

## Base URL

`http://localhost:4000`

## Health

`GET /health`

## Auth

- `POST /auth/login` (guest)
- `POST /auth/register` (guest)
- `POST /auth/admin/login` (admin)

## Suites & Apartments

- `GET /suites`
- `GET /suites/:id`
- `POST /admin/suites`
- `PUT /admin/suites/:id`
- `DELETE /admin/suites/:id`

## Availability

- `POST /availability`

Body:
```json
{
  "checkIn": "2026-02-10",
  "checkOut": "2026-02-12",
  "guests": 2
}
```

## Bookings

- `POST /bookings`
- `GET /admin/bookings`
- `GET /bookings/:id`
- `PUT /admin/bookings/:id/status`
- `POST /bookings/:id/cancel`

Booking payload supports add-ons:
- `mealOrderName`, `mealOrderAmount`
- `otherOrderName`, `otherOrderAmount`

## Payments

- `POST /payments/initialize`
- `POST /payments/verify`
- `GET /admin/payments`
- `GET /payments/:paymentId/receipt/:format`

Supported gateways:
- `PAYSTACK`
- `FLUTTERWAVE`

## Environment Variables

Use `Server/.env.example` as template.

Required service blocks:
- MySQL (`DB_*`)
- JWT (`JWT_SECRET`)
- Cloudinary (`CLOUDINARY_*`)
- Paystack (`PAYSTACK_*`)
- Flutterwave (`FLUTTERWAVE_*`)

## Postman

Import:
`Postman/517-vip-suites.postman_collection.json`
