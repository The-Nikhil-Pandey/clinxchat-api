# User Registration API

A Node.js RESTful API for user registration with MySQL database.

## Features

- User registration with input validation
- Password hashing using bcrypt
- MySQL database integration with connection pooling
- Input validation and sanitization
- Error handling
- CORS enabled

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL
- **Validation**: express-validator
- **Security**: bcryptjs for password hashing

## Project Structure

```
├── config/
│   └── db.js              # Database configuration and connection
├── controllers/
│   └── userController.js  # Request handlers
├── middleware/
│   ├── errorHandler.js    # Error handling middleware
│   └── validation.js      # Input validation rules
├── models/
│   └── userModel.js       # Database operations
├── routes/
│   └── userRoutes.js      # API routes
├── server.js              # Main application entry
├── .env                   # Environment variables (configure this)
├── .env.example           # Environment template
└── package.json           # Dependencies
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Edit the `.env` file with your MySQL credentials:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=user_registration_db
DB_PORT=3306
PORT=3000
```

### 3. Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will:
- Automatically create the database if it doesn't exist
- Create the `users` table if it doesn't exist
- Start listening on the configured port

## API Endpoints

### Register User
```
POST /api/users/register
Content-Type: application/json

{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "password": "Password@123",
    "phone": "+1234567890"  // optional
}
```

**Success Response (201):**
```json
{
    "success": true,
    "message": "User registered successfully",
    "data": {
        "id": 1,
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.com",
        "phone": "+1234567890"
    }
}
```

**Validation Error Response (400):**
```json
{
    "success": false,
    "message": "Validation failed",
    "errors": [
        {
            "field": "email",
            "message": "Please provide a valid email address"
        }
    ]
}
```

### Get All Users
```
GET /api/users
```

### Get User by ID
```
GET /api/users/:id
```

### Health Check
```
GET /health
```

## Validation Rules

| Field | Rules |
|-------|-------|
| firstName | Required, 2-50 chars, letters only |
| lastName | Required, 2-50 chars, letters only |
| email | Required, valid email format, unique |
| password | Required, min 8 chars, must contain uppercase, lowercase, number, and special character |
| phone | Optional, 10-20 chars, digits and phone symbols only |

## Testing with cURL

**Register a new user:**
```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"John","lastName":"Doe","email":"john@example.com","password":"Password@123"}'
```

**Get all users:**
```bash
curl http://localhost:3000/api/users
```

## License

ISC
