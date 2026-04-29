import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, query, where, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// ==========================================
// 1. ตั้งค่าพื้นฐาน (แก้ไขเป็นข้อมูลของคุณ)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBL30YDtuYkvGL3RWoIgxKzPryftOUdY0Q",
  authDomain: "stamp-oph.firebaseapp.com",
  projectId: "stamp-oph",
  storageBucket: "stamp-oph.firebasestorage.app",
  messagingSenderId: "720578565437",
  appId: "1:720578565437:web:5b1556069ae240c50f2154"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const LIFF_ID = "2009930524-FAPRpgm8"; 
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyJX0CpJEaLeMuqhJB4cxl_KODWh2Azk9ZWp_QC0knqu8rUVvp5T2D5DIFAjDEulQqIqQ/exec";

let currentUserProfile = null;
let currentRole = "user";
let html5QrcodeScanner = null;
let tempRegistrationData = null; // เก็บข้อมูลชั่วคราวก่อนกดยืนยัน

// ==========================================
// 2. ฟังก์ชันสลับหน้าจอ
// ==========================================
const ui = {
    loading: document.getElementById('loadingSection'),
    register: document.getElementById('registerSection'),
    confirm: document.getElementById('confirmSection'),
    dashboard: document.getElementById('dashboardSection'),
    scanner: document.getElementById('scannerSection'),
    dataList: document.getElementById('dataListSection')
};

function showSection(sectionId) {
    Object.values(ui).forEach(el => el.classList.add('hidden'));
    ui[sectionId].classList.remove('hidden');
}

// ==========================================
// 3. เริ่มต้นระบบและตรวจสอบข้อมูล User
// ==========================================
async function initLiff() {
    await liff.init({ liffId: LIFF_ID });
    if (liff.isLoggedIn()) {
        currentUserProfile = await liff.getProfile();
        checkUserInFirebase();
    } else {
        liff.login();
    }
}

async function checkUserInFirebase() {
    const userRef = doc(db, "users", currentUserProfile.userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        const userData = userSnap.data();
        currentRole = userData.role || "user";
        
        // กำหนดค่าลงใน Dashboard
        document.getElementById('userNameDisplay').innerText = `สวัสดีคุณ ${userData.name}`;
        document.getElementById('userPointsDisplay').innerText = userData.points;
        generateQRCode(userData.nationalId);

        // ถ้าเป็น Admin ให้โชว์เมนู Admin เพิ่มขึ้นมา
        if (currentRole === "admin") {
            document.getElementById('adminMenuBox').classList.remove('hidden');
        } else {
            document.getElementById('adminMenuBox').classList.add('hidden');
        }
        showSection('dashboard');
    } else {
        showSection('register');
    }
}

// ==========================================
// 4. ระบบลงทะเบียน (กรอก -> เช็ค Sheet -> ยืนยัน)
// ==========================================
document.getElementById('btnCheckId').addEventListener('click', async () => {
    const id = document.getElementById('nationalIdInput').value;
    if(id.length !== 13) return alert("กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก");

    showSection('loading');
    try {
        const res = await fetch(`${GAS_API_URL}?id=${id}`);
        const data = await res.json();
        
        if (data.status === "success") {
            // เก็บข้อมูลไว้ก่อน ยังไม่บันทึกลง Firebase
            tempRegistrationData = {
                nationalId: id,
                name: `${data.firstName} ${data.lastName}`,
                points: 0,
                role: "user"
            };
            
            // แสดงหน้ายืนยัน
            document.getElementById('confirmName').innerText = tempRegistrationData.name;
            document.getElementById('confirmId').innerText = tempRegistrationData.nationalId;
            showSection('confirm');
        } else {
            alert("ไม่พบข้อมูลของคุณในระบบ (Google Sheet)");
            showSection('register');
        }
    } catch (e) {
        alert("เกิดข้อผิดพลาดในการเชื่อมต่อดึงข้อมูล");
        showSection('register');
    }
});

// กดยืนยันการลงทะเบียน
document.getElementById('btnConfirmRegister').addEventListener('click', async () => {
    if (!tempRegistrationData) return;
    showSection('loading');
    try {
        await setDoc(doc(db, "users", currentUserProfile.userId), tempRegistrationData);
        alert("ลงทะเบียนสำเร็จเรียบร้อย!");
        checkUserInFirebase();
    } catch(e) {
        alert("บันทึกข้อมูลไม่สำเร็จ");
        showSection('confirm');
    }
});

// กดยกเลิกกลับไปหน้ากรอกใหม่
document.getElementById('btnCancelRegister').addEventListener('click', () => {
    tempRegistrationData = null;
    document.getElementById('nationalIdInput').value = "";
    showSection('register');
});

// สร้าง QR Code จากเลขบัตร ปชช.
function generateQRCode(text) {
    const container = document.getElementById("qrCodeContainer");
    container.innerHTML = ""; 
    new QRCode(container, { text: text, width: 180, height: 180, colorDark : "#000000", colorLight : "#ffffff" });
}

// ดูประวัติของตัวเอง (Log ของ User)
document.getElementById('btnViewPersonalLogs').addEventListener('click', async () => {
    showSection('loading');
    const qUser = query(collection(db, "logs"), where("lineUid", "==", currentUserProfile.userId));
    const snap = await getDocs(qUser);
    renderTable("ประวัติการได้รับแต้มของฉัน", ["เวลา", "ได้รับจากฐาน", "เจ้าหน้าที่รหัส"], snap, "personalLogs");
});

// ==========================================
// 5. เมนูผู้ดูแลระบบ (Admin)
// ==========================================

// -- สแกนและบันทึกแต้ม --
document.getElementById('btnScanQR').addEventListener('click', () => {
    showSection('scanner');
    html5QrcodeScanner = new Html5Qrcode("reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" }, // ใช้กล้องหลัง
        { fps: 10, qrbox: 250 },
        async (decodedText) => {
            html5QrcodeScanner.stop();
            await processScannedData(decodedText);
        },
        (errorMessage) => {}
    );
});

document.getElementById('closeScannerBtn').addEventListener('click', () => {
    if(html5QrcodeScanner) html5QrcodeScanner.stop();
    showSection('dashboard');
});

async function processScannedData(scannedNationalId) {
    // 1. ให้กรอกรหัสเจ้าหน้าที่
    const staffCode = prompt("📷 สแกน QR สำเร็จ!\n\nกรุณากรอกรหัสเจ้าหน้าที่ (Staff Code) ประจำฐานเพื่อแจกแต้ม:");
    if (!staffCode) return showSection('dashboard');

    showSection('loading');
    
    // 2. เช็คว่า Staff Code มีอยู่จริงไหมและประจำฐานไหน
    const qStaff = query(collection(db, "staffs"), where("staffCode", "==", staffCode));
    const staffSnap = await getDocs(qStaff);
    
    if (staffSnap.empty) {
        alert("❌ รหัสเจ้าหน้าที่ไม่ถูกต้อง!");
        return showSection('dashboard');
    }

    const staffData = staffSnap.docs[0].data();

    // 3. หาข้อมูล User จาก National ID ที่สแกนได้
    const qUser = query(collection(db, "users"), where("nationalId", "==", scannedNationalId));
    const userSnap = await getDocs(qUser);

    if (userSnap.empty) {
        alert("❌ ไม่พบผู้ใช้งานที่ลงทะเบียนด้วย QR Code นี้");
        return showSection('dashboard');
    }

    const userDocId = userSnap.docs[0].id;

    // 4. บันทึกแต้ม (+1) และเก็บประวัติลง Logs
    await updateDoc(doc(db, "users", userDocId), { points: increment(1) });
    
    await addDoc(collection(db, "logs"), {
        timestamp: new Date().toLocaleString("th-TH"),
        lineUid: userDocId,
        nationalId: scannedNationalId,
        stationId: staffData.stationId,
        staffCode: staffCode
    });

    alert(`✅ แจกแต้มสำเร็จ!\n\nฐาน: ${staffData.stationId}`);
    showSection('dashboard');
}

// -- จัดการฐานกิจกรรม --
document.getElementById('btnManageStations').addEventListener('click', async () => {
    showSection('loading');
    const snap = await getDocs(collection(db, "stations"));
    renderTable("จัดการฐานกิจกรรม (เพิ่ม/ลบ)", ["รหัสฐาน", "ชื่อฐาน"], snap, "stations");
});

// -- จัดการเจ้าหน้าที่ --
document.getElementById('btnManageStaffs').addEventListener('click', async () => {
    showSection('loading');
    const snap = await getDocs(collection(db, "staffs"));
    renderTable("จัดการเจ้าหน้าที่ (กำหนดสิทธิ์)", ["รหัส จนท.", "Staff Code", "ประจำฐาน"], snap, "staffs");
});

// -- จัดการประวัติการบันทึกแต้ม (Admin Logs) --
document.getElementById('btnAdminLogs').addEventListener('click', async () => {
    showSection('loading');
    const snap = await getDocs(collection(db, "logs"));
    renderTable("ประวัติการแจกแต้มทั้งหมด", ["เวลา", "เลขบัตรผู้รับ", "รหัส จนท.", "ฐาน"], snap, "adminLogs");
});

// ==========================================
// 6. ฟังก์ชันสร้างตารางอเนกประสงค์
// ==========================================
function renderTable(title, headers, snapshot, type) {
    document.getElementById('dataListTitle').innerText = title;
    
    let thead = "<tr>";
    headers.forEach(h => thead += `<th>${h}</th>`);
    thead += "</tr>";
    document.getElementById('dataHead').innerHTML = thead;

    let tbody = "";
    snapshot.forEach(doc => {
        const d = doc.data();
        tbody += "<tr>";
        if(type === "stations") tbody += `<td>${d.stationId}</td><td>${d.stationName}</td>`;
        if(type === "staffs") tbody += `<td>${d.staffId}</td><td>${d.staffCode}</td><td>${d.stationId}</td>`;
        if(type === "personalLogs") tbody += `<td>${d.timestamp}</td><td>${d.stationId}</td><td>${d.staffCode}</td>`;
        if(type === "adminLogs") tbody += `<td>${d.timestamp}</td><td>${d.nationalId}</td><td>${d.staffCode}</td><td>${d.stationId}</td>`;
        tbody += "</tr>";
    });
    
    if(snapshot.empty) {
        tbody = `<tr><td colspan="${headers.length}">ไม่มีข้อมูล</td></tr>`;
    }
    
    document.getElementById('dataBody').innerHTML = tbody;

    // ปุ่มเพิ่มข้อมูล จะแสดงเฉพาะจัดการฐานและเจ้าหน้าที่
    const addBtn = document.getElementById('addDataBtn');
    addBtn.className = (type === "stations" || type === "staffs") ? "admin-btn" : "hidden"; 
    
    addBtn.onclick = async () => {
        if (type === "stations") {
            const sid = prompt("กรอก 'รหัสฐาน' ที่ต้องการเพิ่ม (เช่น ST01):");
            const sname = prompt("กรอก 'ชื่อฐานกิจกรรม':");
            if(sid && sname) await setDoc(doc(db, "stations", sid), { stationId: sid, stationName: sname });
        } else if (type === "staffs") {
            const stId = prompt("กรอก 'รหัสเจ้าหน้าที่' (เช่น M01):");
            const stCode = prompt("กำหนด 'Staff Code' (รหัสสำหรับสแกนแจกแต้ม):");
            const stStation = prompt("ประจำอยู่ที่ฐานรหัสอะไร? (เช่น ST01):");
            if(stId && stCode && stStation) await setDoc(doc(db, "staffs", stId), { staffId: stId, staffCode: stCode, stationId: stStation });
        }
        alert("เพิ่มข้อมูลสำเร็จ โปรดเปิดเมนูนี้ใหม่อีกครั้งเพื่อรีเฟรชตาราง");
        showSection('dashboard');
    };

    document.getElementById('closeDataBtn').onclick = () => showSection('dashboard');
    showSection('dataList');
}

// เริ่มการทำงานของระบบ
initLiff();
