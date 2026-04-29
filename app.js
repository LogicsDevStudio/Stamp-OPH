import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, query, where, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// ==========================================
// 1. ตั้งค่าพื้นฐาน
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
let savedStaffCode = null;
let html5QrcodeScanner = null;
let tempRegistrationData = null;

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
        
        document.getElementById('userNameDisplay').innerText = userData.name;
        document.getElementById('userPointsDisplay').innerText = userData.points;
        generateQRCode(userData.nationalId);
        loadUserStationStatus(currentUserProfile.userId);

        const adminBox = document.getElementById('adminMenuBox');
        const staffBox = document.getElementById('staffMenuBox');

        if(adminBox) adminBox.classList.add('hidden');
        if(staffBox) staffBox.classList.add('hidden');

        if (currentRole === "admin" && adminBox) {
            adminBox.classList.remove('hidden');
        } else if (currentRole === "staff" && staffBox) {
            staffBox.classList.remove('hidden');
        }

        setupScanButtons();
        showSection('dashboard');
    } else {
        showSection('register');
    }
}

// ==========================================
// 4. ระบบลงทะเบียน
// ==========================================
document.getElementById('btnCheckId').addEventListener('click', async () => {
    const id = document.getElementById('nationalIdInput').value;
    if(id.length !== 13) return alert("กรุณากรอกเลขบัตรประชาชนให้ครบ 13 หลัก");

    showSection('loading');
    try {
        const res = await fetch(`${GAS_API_URL}?id=${id}`);
        const data = await res.json();
        
        if (data.status === "success") {
            tempRegistrationData = {
                nationalId: id,
                name: `${data.firstName} ${data.lastName}`,
                points: 0,
                role: "user"
            };
            
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

document.getElementById('btnCancelRegister').addEventListener('click', () => {
    tempRegistrationData = null;
    document.getElementById('nationalIdInput').value = "";
    showSection('register');
});

function generateQRCode(text) {
    const container = document.getElementById("qrCodeContainer");
    if(!container) return;
    container.innerHTML = ""; 
    new QRCode(container, { text: text, width: 180, height: 180, colorDark : "#000000", colorLight : "#ffffff" });
}

document.getElementById('btnViewPersonalLogs')?.addEventListener('click', async () => {
    showSection('loading');
    const qUser = query(collection(db, "logs"), where("lineUid", "==", currentUserProfile.userId));
    const snap = await getDocs(qUser);
    renderTable("ประวัติการได้รับแต้มของฉัน", ["เวลา", "ได้รับจากฐาน", "เจ้าหน้าที่รหัส"], snap, "personalLogs");
});

// ==========================================
// 🚀 5. ระบบสแกนและแจกแต้ม (ความเร็วสูง)
// ==========================================
function startScanner() {
    showSection('scanner');
    html5QrcodeScanner = new Html5Qrcode("reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        async (decodedText) => {
            html5QrcodeScanner.stop();
            await processScannedData(decodedText);
        },
        (errorMessage) => {}
    );
}

function setupScanButtons() {
    const btnStaff = document.getElementById('btnStaffScanQR');
    if (btnStaff) btnStaff.onclick = () => startScanner();

    const btnAdmin = document.getElementById('btnScanQR');
    if (btnAdmin) btnAdmin.onclick = () => startScanner();
}

document.getElementById('closeScannerBtn')?.addEventListener('click', () => {
    if(html5QrcodeScanner) html5QrcodeScanner.stop();
    showSection('dashboard');
});

async function processScannedData(scannedNationalId) {
    if (!savedStaffCode) {
        savedStaffCode = prompt("📷 สแกนสำเร็จ!\n\nกรุณากรอกรหัสเจ้าหน้าที่ (Staff Code) ประจำฐานเพื่อแจกแต้ม:");
        if (!savedStaffCode) return showSection('dashboard');
    }

    showSection('loading');
    
    try {
        const [staffSnap, userSnap] = await Promise.all([
            getDocs(query(collection(db, "staffs"), where("staffCode", "==", savedStaffCode))),
            getDocs(query(collection(db, "users"), where("nationalId", "==", scannedNationalId)))
        ]);
        
        if (staffSnap.empty) {
            alert("❌ รหัสเจ้าหน้าที่ไม่ถูกต้อง!");
            savedStaffCode = null;
            return showSection('dashboard');
        }
        if (userSnap.empty) {
            alert("❌ ไม่พบผู้ใช้งานที่ลงทะเบียนด้วย QR Code นี้");
            return showSection('dashboard');
        }

        const staffData = staffSnap.docs[0].data();
        const userDocId = userSnap.docs[0].id;

        await Promise.all([
            updateDoc(doc(db, "users", userDocId), { points: increment(1) }),
            addDoc(collection(db, "logs"), {
                timestamp: new Date().toLocaleString("th-TH"),
                lineUid: userDocId,
                nationalId: scannedNationalId,
                stationId: staffData.stationId,
                staffId: staffData.staffId,
                staffCode: savedStaffCode
            })
        ]);

        alert(`✅ แจกแต้มสำเร็จ!\n\nฐาน: ${staffData.stationId}`);
        checkUserInFirebase(); 
        
    } catch (error) {
        console.error("Error saving points:", error);
        alert("❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่");
        showSection('dashboard');
    }
}

// ==========================================
// 6. เมนูผู้ดูแลระบบ (Admin)
// ==========================================
document.getElementById('btnManageUsers')?.addEventListener('click', async () => {
    showSection('loading');
    const snap = await getDocs(collection(db, "users"));
    renderTable("รายชื่อผู้เข้าร่วมทั้งหมด", ["ชื่อ-นามสกุล", "เลขบัตรประชาชน", "แต้มสะสม", "จัดการ"], snap, "users");
});

document.getElementById('btnManageStations')?.addEventListener('click', async () => {
    showSection('loading');
    const snap = await getDocs(collection(db, "stations"));
    renderTable("จัดการฐานกิจกรรม", ["รหัสฐาน", "ชื่อฐาน"], snap, "stations");
});

document.getElementById('btnManageStaffs')?.addEventListener('click', async () => {
    showSection('loading');
    const snap = await getDocs(collection(db, "staffs"));
    renderTable("จัดการเจ้าหน้าที่", ["รหัส จนท.", "Staff Code", "ประจำฐาน"], snap, "staffs");
});

document.getElementById('btnAdminLogs')?.addEventListener('click', async () => {
    showSection('loading');
    const snap = await getDocs(collection(db, "logs"));
    renderTable("ประวัติการแจกแต้มทั้งหมด", ["เวลา", "เลขบัตรผู้รับ", "รหัส จนท.", "ฐาน"], snap, "adminLogs");
});

// ==========================================
// 7. ฟังก์ชันสร้างตารางอเนกประสงค์
// ==========================================
function renderTable(title, headers, snapshot, type) {
    document.getElementById('dataListTitle').innerText = title;
    
    // สร้าง thead
    let thead = "<tr>";
    headers.forEach(h => thead += `<th>${h}</th>`);
    thead += "</tr>";
    document.getElementById('dataHead').innerHTML = thead;

    // สร้าง tbody
    let tbody = "";
    snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;
        tbody += "<tr>";
        
        if (type === "stations") {
            tbody += `
                <td><span style="font-family:'DM Mono',monospace; font-size:12px;">${d.stationId}</span></td>
                <td>${d.stationName}</td>`;
        }

        if (type === "staffs") {
            tbody += `
                <td><span style="font-family:'DM Mono',monospace; font-size:12px;">${d.staffId}</span></td>
                <td><span style="font-family:'DM Mono',monospace; font-size:12px; background:var(--ground); padding:2px 8px; border-radius:4px; border:1px solid var(--border);">${d.staffCode}</span></td>
                <td>${d.stationId}</td>`;
        }

        if (type === "personalLogs") {
            tbody += `
                <td style="color:var(--ink-muted); font-size:11px;">${d.timestamp}</td>
                <td>${d.stationId}</td>
                <td><span style="font-family:'DM Mono',monospace; font-size:11px;">${d.staffId || d.staffCode}</span></td>`;
        }

        if (type === "adminLogs") {
            tbody += `
                <td style="color:var(--ink-muted); font-size:11px;">${d.timestamp}</td>
                <td><span style="font-family:'DM Mono',monospace; font-size:11px;">${d.nationalId}</span></td>
                <td><span style="font-family:'DM Mono',monospace; font-size:11px;">${d.staffId || d.staffCode}</span></td>
                <td>${d.stationId}</td>`;
        }
        
        if (type === "users") {
            tbody += `
                <td style="font-weight:500;">${d.name}</td>
                <td><span style="font-family:'DM Mono',monospace; font-size:11px;">${d.nationalId}</span></td>
                <td><span class="badge-pts">${d.points}</span></td>
                <td>
                    <button class="tbl-action-btn" onclick="viewSpecificUserLogs('${id}', '${d.name}')">
                        <i class="bi bi-clock-history"></i> ประวัติ
                    </button>
                </td>`;
        }
        
        tbody += "</tr>";
    });
    
    if (snapshot.empty) {
        tbody = `<tr><td colspan="${headers.length}" style="text-align:center; color:var(--ink-muted); padding:24px;">ไม่มีข้อมูล</td></tr>`;
    }
    
    document.getElementById('dataBody').innerHTML = tbody;

    // ปุ่มเพิ่มข้อมูล (เฉพาะฐานและเจ้าหน้าที่)
    const addBtn = document.getElementById('addDataBtn');
    if (addBtn) {
        if (type === "stations" || type === "staffs") {
            addBtn.classList.remove('hidden');
            addBtn.className = 'btn-secondary-custom';
        } else {
            addBtn.classList.add('hidden');
        }

        addBtn.onclick = async () => {
            if (type === "stations") {
                const sid = prompt("กรอก 'รหัสฐาน' ที่ต้องการเพิ่ม:");
                const sname = prompt("กรอก 'ชื่อฐานกิจกรรม':");
                if (sid && sname) await setDoc(doc(db, "stations", sid), { stationId: sid, stationName: sname });
            } else if (type === "staffs") {
                const stId = prompt("กรอก 'รหัสเจ้าหน้าที่':");
                const stCode = prompt("กำหนด 'Staff Code':");
                const stStation = prompt("ประจำฐานรหัสอะไร?:");
                if (stId && stCode && stStation) await setDoc(doc(db, "staffs", stId), { staffId: stId, staffCode: stCode, stationId: stStation });
            }
            alert("บันทึกสำเร็จ!");
            showSection('dashboard');
        };
    }

    document.getElementById('closeDataBtn').onclick = () => showSection('dashboard');
    showSection('dataList');
}

// ฟังก์ชันดึงประวัติแต้มของ "คนใดคนหนึ่ง"
window.viewSpecificUserLogs = async function(userId, userName) {
    showSection('loading');
    try {
        const qUser = query(collection(db, "logs"), where("lineUid", "==", userId));
        const snap = await getDocs(qUser);
        renderTable(`ประวัติแต้มของ: ${userName}`, ["เวลา", "ฐานที่เข้า", "เจ้าหน้าที่"], snap, "personalLogs");
    } catch (e) {
        alert("ไม่สามารถโหลดประวัติได้");
        showSection('dashboard');
    }
};

// ==========================================
// 8. ฟังก์ชันโหลดสถานะฐานกิจกรรม
// ==========================================
async function loadUserStationStatus(userId) {
    const container = document.getElementById('stationStatusContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="grid-column:span 3; text-align:center; padding:12px 0;">
            <div style="width:20px;height:20px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto;"></div>
        </div>`;

    try {
        const stationSnap = await getDocs(collection(db, "stations"));
        const stations = [];
        stationSnap.forEach(doc => stations.push(doc.data()));

        const qLogs = query(collection(db, "logs"), where("lineUid", "==", userId));
        const logSnap = await getDocs(qLogs);
        
        const completedStations = new Set();
        logSnap.forEach(doc => completedStations.add(doc.data().stationId));

        container.innerHTML = "";
        
        if (stations.length === 0) {
            container.innerHTML = `<p style="grid-column:span 3; color:var(--ink-faint); font-size:13px; text-align:center; padding:16px 0;">ยังไม่มีข้อมูลฐานกิจกรรมในระบบ</p>`;
            return;
        }

        stations.sort((a, b) => a.stationId.localeCompare(b.stationId));

        stations.forEach(st => {
            const isCompleted = completedStations.has(st.stationId);
            const div = document.createElement('div');
            
            if (isCompleted) {
                div.className = "station-item station-completed";
                div.innerHTML = `
                    <span class="icon"><i class="bi bi-check-circle-fill"></i></span>
                    <span>${st.stationName}</span>`;
            } else {
                div.className = "station-item station-pending";
                div.innerHTML = `
                    <span class="icon"><i class="bi bi-lock"></i></span>
                    <span>${st.stationName}</span>`;
            }
            
            container.appendChild(div);
        });

    } catch (error) {
        console.error("Error loading station status:", error);
        container.innerHTML = `<p style="grid-column:span 3; color:var(--danger); font-size:13px; text-align:center;">เกิดข้อผิดพลาดในการโหลดข้อมูลฐาน</p>`;
    }
}

// เริ่มการทำงาน
initLiff();
