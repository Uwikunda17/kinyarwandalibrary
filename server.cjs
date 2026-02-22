// Import express
const express = require("express");

// Create app
const app = express();

// Define port
const PORT = process.env.PORT || 3000;

// Simple route
app.get("/", (req, res) => {
  res.send("Server is running successfully 🚀");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
