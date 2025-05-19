const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, text) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("❌ E-postkonfiguration saknas. Inget mail skickades.");
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail", // <-- Använd GMAIL!
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Burger & Gold" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
    };

    await transporter.sendMail(mailOptions);
    console.log("📨 E-post skickad till:", to);
  } catch (error) {
    console.error("❌ Fel vid försök att skicka e-post:", error.message);
  }
};

module.exports = sendEmail;
