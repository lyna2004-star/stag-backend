console.log("START 🚀");

const express = require("express");
const cors = require('cors');
const mysql = require("mysql2");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(cors({
  origin: "https://stag-frontend-lyna2004-stars-projects.vercel.app", // رابطك من الصورة
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// ================== DB ==================
const db = mysql.createConnection({
  host: "mysql-1d6f3895-kitounilina180-638c.l.aivencloud.com",
  user: "avnadmin",
  password: "AVNS_uD_WKF1fYqiQQbQ8x9C",
  database: "defaultdb",
  port: 13928,
  ssl: {
    rejectUnauthorized: false // هذا السطر ضروري جداً للاتصال بسيرفر Aiven
  }
});

db.connect(err => {
  if (err) {
    console.log("❌ Error connecting to Aiven:", err.message);
  } else {
    console.log("MySQL Aiven Connected ✅");
  }
});
// ================== REGISTER ==================
app.post("/register", (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "الرجاء ملء جميع الحقول ⚠️" });
  }

  // تحويل الرول لحروف صغيرة لضمان التوافق مع ENUM
  const userRole = role.toLowerCase().trim();

  const sql = "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)";

  db.query(sql, [name, email, password, userRole], (err, result) => {
    if (err) {
      console.error("❌ SQL Error:", err.message);
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: "الإيميل مسجل مسبقاً 📧" });
      }
      return res.status(500).json({ message: "خطأ في قاعدة البيانات", error: err.message });
    }

    // الطريقة الصحيحة والمضمونة للحصول على الـ ID في mysql2
    const userId = result.insertId;

    if (!userId) {
      return res.status(500).json({ message: "فشل في الحصول على معرف المستخدم" });
    }

    try {
      const token = jwt.sign(
        { id: userId, role: userRole },
        "secretkey",
        { expiresIn: "1h" }
      );

      return res.json({ 
        message: "تم إنشاء الحساب بنجاح ✅",
        token,
        user: { id: userId, name, role: userRole }
      });
    } catch (jwtErr) {
      return res.status(500).json({ message: "خطأ في إنشاء التوكن" });
    }
  });
});

// ================== LOGIN ==================
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ?";

  db.query(sql, [email], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Server error ❌" });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "User not found ❌" });
    }

    const user = result[0];

   
    if (user.password !== password) {
      return res.status(401).json({ message: "Wrong password ❌" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      "secretkey",
      { expiresIn: "1h" }
    );

  
    return res.json({
      message: "Login success ✅",
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role 
      }
    });
  });
});

// ================== MIDDLEWARE ==================


// 1. التحقق من التوكن (Token Verification)
function verifyToken(req, res, next) {
  // Express يحول جميع الهيدرز إلى حروف صغيرة تلقائياً
  const authHeader = req.headers['authorization']; 

  if (!authHeader) {
    console.log("❌ No token provided in headers");
    return res.status(401).json({ message: "No token ❌" });
  }

  // استخراج التوكن من صيغة Bearer Token
  const token = authHeader.startsWith("Bearer ") 
    ? authHeader.split(' ')[1] 
    : authHeader;

  jwt.verify(token, "secretkey", (err, decoded) => {
    if (err) {
      console.log("❌ JWT Verification Failed:", err.message);
      return res.status(403).json({ message: "Invalid token ❌" });
    }

    // تخزين بيانات المستخدم في الطلب لاستخدامها لاحقاً
    req.user = {
      ...decoded,
      id: Number(decoded.id) 
    };
    next();
  });
}

// 2. التحقق من الصلاحيات (Role Authorization)
function authorize(roles = []) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: You don't have permission ❌" });
    }
    next();
  };
}

// ================== OFFERS CRUD ==================


app.post("/offers", verifyToken, authorize(["company"]), (req, res) => {
  const { title, description } = req.body;
  const company_id = req.user.id;

  const sql = "INSERT INTO offers (title, description, company_id) VALUES (?, ?, ?)";

  db.query(sql, [title, description, company_id], (err) => {
    if (err) return res.status(500).json({ message: "Error ❌" });

    res.json({ message: "Offer added ✅" });
  });
});

// READ ALL
app.get("/offers", (req, res) => {
  db.query("SELECT * FROM offers", (err, result) => {
    if (err) return res.status(500).json({ message: "Error ❌" });

    res.json(result);
  });
});

// READ ONE
app.get("/offers/:id", (req, res) => {
  db.query("SELECT * FROM offers WHERE id = ?", [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ message: "Error ❌" });

    if (result.length === 0) {
      return res.status(404).json({ message: "Offer not found ❌" });
    }

    res.json(result[0]);
  });
});

// UPDATE (company only)
app.put("/offers/:id", verifyToken, authorize(["company"]), (req, res) => {
  const id = req.params.id;
  const { title, description } = req.body;
  const company_id = req.user.id;

  const checkSql = "SELECT * FROM offers WHERE id = ? AND company_id = ?";

  db.query(checkSql, [id, company_id], (err, result) => {
    if (err) return res.status(500).json({ message: "Error ❌" });

    if (result.length === 0) {
      return res.status(403).json({ message: "Forbidden ❌" });
    }

    const sql = "UPDATE offers SET title = ?, description = ? WHERE id = ?";

    db.query(sql, [title, description, id], (err) => {
      if (err) return res.status(500).json({ message: "Error ❌" });

      res.json({ message: "Offer updated ✅" });
    });
  });
});


app.delete("/offers/:id", verifyToken, authorize(["company"]), (req, res) => {
  const id = req.params.id;
  const company_id = req.user.id;

  // 1. التأكد من أن الشركة هي صاحبة هذا العرض قبل الحذف
  const checkSql = "SELECT * FROM offers WHERE id = ? AND company_id = ?";

  db.query(checkSql, [id, company_id], (err, result) => {
    if (err) return res.status(500).json({ message: "Error ❌" });

    if (result.length === 0) {
      return res.status(403).json({ message: "Forbidden ❌" });
    }

    
    const deleteConventions = "DELETE FROM conventions WHERE offer_id = ?";
    const deleteApplications = "DELETE FROM applications WHERE offer_id = ?";
    const deleteOffer = "DELETE FROM offers WHERE id = ?";

    db.query(deleteConventions, [id], (err) => {
      if (err) return res.status(500).json({ message: "Error deleting conventions ❌" });

      db.query(deleteApplications, [id], (err) => {
        if (err) return res.status(500).json({ message: "Error deleting applications ❌" });

        // 3. الآن نحذف العرض الأصلي بعد تنظيف الجداول المرتبطة
        db.query(deleteOffer, [id], (err) => {
          if (err) return res.status(500).json({ message: "Error deleting offer ❌" });

          res.json({ message: "Offer and all related data deleted ✅" });
        });
      });
    });
  });
});


app.get("/my-offers", verifyToken, authorize(["company"]), (req, res) => {
  const company_id = req.user.id;
  console.log("User ID from token:", req.user.id);
  const sql = "SELECT * FROM offers WHERE company_id = ?";

  db.query(sql, [company_id], (err, result) => {
    if (err) return res.status(500).json({ message: "Error ❌" });
    res.json(result);
  });
});

// ================== APPLICATIONS =================
app.post("/applications", verifyToken, authorize(["student"]), (req, res) => {
  const { offer_id } = req.body;
  const student_id = req.user.id;

  const checkOffer = "SELECT * FROM offers WHERE id = ?";

  db.query(checkOffer, [offer_id], (err, offer) => {
    if (err) return res.status(500).json({ message: "Error ❌" });

    if (offer.length === 0) {
      return res.status(404).json({ message: "Offer not found ❌" });
    }

    const checkApp =
      "SELECT * FROM applications WHERE student_id = ? AND offer_id = ?";

    db.query(checkApp, [student_id, offer_id], (err, result) => {
      if (err) return res.status(500).json({ message: "Error ❌" });

      if (result.length > 0) {
        return res.status(409).json({ message: "Already applied ❌" });
      }

      const insert =
        "INSERT INTO applications (student_id, offer_id, status) VALUES (?, ?, 'pending')";

      db.query(insert, [student_id, offer_id], (err) => {
        if (err) return res.status(500).json({ message: "Error ❌" });

        res.json({ message: "Application submitted ✅" });
      });
    });
  });
});

app.put("/applications/:id", verifyToken, authorize(["company"]), (req, res) => {
  const { status } = req.body; // accepted / rejected
  const application_id = req.params.id;

  const sql = "UPDATE applications SET status = ? WHERE id = ?";

  db.query(sql, [status, application_id], (err) => {
    if (err) return res.status(500).json({ message: "Error ❌" });

   
    if (status === "accepted") {

      const getApp = `
        SELECT a.*, o.company_id 
        FROM applications a
        JOIN offers o ON a.offer_id = o.id
        WHERE a.id = ?
      `;

      db.query(getApp, [application_id], (err, result) => {
        if (err) return console.log(err);

        if (result.length === 0) {
          console.log("❌ No application found");
          return;
        }

        const data = result[0];

        const insertConv = `
          INSERT INTO conventions (student_id, company_id, offer_id, status)
          VALUES (?, ?, ?, 'pending')
        `;

        db.query(
          insertConv,
          [data.student_id, data.company_id, data.offer_id],
          (err) => {
            if (err) {
              console.log("❌ Insert convention error:", err);
            } else {
              console.log("✅ Convention created successfully");
            }
          }
        );
      });
    }

    res.json({ message: "Application updated ✅" });
  });
});


app.get("/my-applications", verifyToken, (req, res) => {
    const studentId = req.user.id; 

   
   const sql = `
    SELECT 
        a.*, 
        o.title as offer_title,
        COALESCE(c.status, 'waiting') as admin_status, -- إذا كانت القيمة null يحولها لـ waiting
        c.id as convention_id
    FROM applications a
    JOIN offers o ON a.offer_id = o.id 
    LEFT JOIN conventions c ON a.offer_id = c.offer_id AND a.student_id = c.student_id
    WHERE a.student_id = ?`;

    db.query(sql, [studentId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(result);
    });
});


app.get("/company-applications", verifyToken, authorize(["company"]), (req, res) => {
  const company_id = req.user.id;

  const sql = `
    SELECT 
      a.id, 
      a.status, 
      u.name AS student_name, 
      u.email AS student_email,
      o.title AS offer_title
    FROM applications a
    JOIN offers o ON a.offer_id = o.id
    JOIN users u ON a.student_id = u.id
    WHERE o.company_id = ?
  `;

  db.query(sql, [company_id], (err, result) => {
    if (err) return res.status(500).json({ message: "Error ❌", error: err.message });
    res.json(result);
  });
});


// ================== ADMIN CONVENTIONS ==================

app.get("/admin/conventions", verifyToken, authorize(["admin"]), (req, res) => {

  const sql = `
    SELECT 
      c.id, 
      c.status,
      u1.name AS student_name, 
      u2.name AS company_name, 
      o.title AS offer_title
    FROM conventions c
    JOIN users u1 ON c.student_id = u1.id
    JOIN users u2 ON c.company_id = u2.id
    JOIN offers o ON c.offer_id = o.id
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("❌ SQL Error:", err.message);
      return res.status(500).json({ message: "Error fetching names ❌" });
    }
    res.json(result);
  });
});

app.put("/admin/conventions/:id", verifyToken, authorize(["admin"]), (req, res) => {
  const { status } = req.body; 
  const id = req.params.id;

  const sql = "UPDATE conventions SET status = ? WHERE id = ?";

  db.query(sql, [status, id], (err) => {
    if (err) return res.status(500).json({ message: "Error ❌" });

    res.json({ message: "Convention updated by admin ✅" });
  });
});

// ================== GET CURRENT USER (ME) ==================
app.get("/auth/me", verifyToken, (req, res) => {
  const userId = req.user.id;

  const sql = "SELECT id, name, email, role, created_at FROM users WHERE id = ?";
  
  db.query(sql, [userId], (err, result) => {
    if (err) return res.status(500).json({ message: "Server error ❌" });
    if (result.length === 0) return res.status(404).json({ message: "User not found" });

    res.json(result[0]); // سيرسل الاسم والإيميل والتاريخ للفرونت-إند
  });
});
// ================== TEST ==================
app.get("/protected", verifyToken, (req, res) => {
  res.json({ message: "Access granted ✅", user: req.user });
});

app.get("/", (req, res) => {
  res.send("Backend is working 🚀");
});
// ================== GENERATE PDF ==================

app.get("/conventions/:id/pdf", verifyToken, (req, res) => {
  const applicationId = req.params.id;

  const sql = `
    SELECT 
      a.status AS company_status,
      COALESCE(c.status, 'pending') AS admin_status, 
      u_stud.name AS student_name, 
      u_stud.email AS student_email, 
      o.title AS offer_title, 
      o.description,
      u_comp.name AS company_name
    FROM applications a
    JOIN users u_stud ON a.student_id = u_stud.id
    JOIN offers o ON a.offer_id = o.id
    JOIN users u_comp ON o.company_id = u_comp.id
    LEFT JOIN conventions c ON a.offer_id = c.offer_id AND a.student_id = c.student_id
    WHERE a.id = ?
  `;

  db.query(sql, [applicationId], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (result.length === 0) return res.status(404).send("Application not found");

    const data = result[0];

    // --- التصحيح الجوهري هنا ---
    // تحويل كل الحالات إلى حروف صغيرة وإزالة المسافات لضمان المقارنة الصحيحة
    const cStatus = (data.company_status || "").toLowerCase().trim();
    const aStatus = (data.admin_status || "").toLowerCase().trim();

    // فحص مرن يقبل الكلمتين (accepted أو approved)
    const isCompanyAccepted = cStatus === 'accepted' || cStatus === 'approved';
    const isAdminAccepted = aStatus === 'accepted' || aStatus === 'approved';

    if (!isCompanyAccepted || !isAdminAccepted) {
      return res.status(403).send(`Access Denied: Company is ${cStatus} and Admin is ${aStatus}`);
    }

    // --- توليد ملف الـ PDF ---
    try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        
        // إعداد الهيدرز
        res.setHeader("Content-Type", "application/pdf");
        const safeName = data.student_name.replace(/\s+/g, '_');
        res.setHeader("Content-Disposition", `attachment; filename=Convention_${safeName}.pdf`);

        doc.pipe(res);

        // التصميم الهيدر
        doc.save().rect(0, 0, doc.page.width, 100).fill('#82CAFF');
        doc.fillColor('#FFFFFF').fontSize(28).text("STAG.IO", 50, 35);
        doc.fontSize(10).text("OFFICIAL INTERNSHIP CONVENTION", 50, 70);
        doc.restore();

        doc.moveDown(6);

        // 1. الطالب
        doc.fillColor('#1e293b').fontSize(16).text("1. Student Information", { underline: true });
        doc.fontSize(12).fillColor('#475569').text(`Name: ${data.student_name}`);
        doc.text(`Email: ${data.student_email}`);
        
        doc.moveDown();

        // 2. الشركة
        doc.fillColor('#1e293b').fontSize(16).text("2. Company Information", { underline: true });
        doc.fontSize(12).fillColor('#475569').text(`Company Name: ${data.company_name}`);

        doc.moveDown();

        // 3. العرض
        doc.fillColor('#1e293b').fontSize(16).text("3. Internship Details", { underline: true });
        doc.fontSize(12).fillColor('#000').text(`Position: ${data.offer_title}`);
        doc.fontSize(10).fillColor('#64748b').text(data.description || "No description provided", { align: 'justify' });

        doc.moveDown(2);

        // صندوق الحالة النهائي
        const currentY = doc.y;
        doc.save().roundedRect(50, currentY, 500, 45, 10).fill('#F1F5F9');
        doc.fillColor('#10B981').fontSize(14)
           .text(`STATUS: VALIDATED BY ALL PARTIES`, 50, currentY + 15, { align: 'center', width: 500 });
        doc.restore();

        doc.end();
    } catch (pdfError) {
        console.error("PDF Generation Error:", pdfError);
        res.status(500).send("Error generating PDF");
    }
  });
});
// ================== SERVER ==================
const PORT = process.env.PORT || 3000; 

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} 🚀`);
});