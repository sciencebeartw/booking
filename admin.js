import { db, ref, set, remove, push, update, storage, storageRef, uploadBytes, getDownloadURL, get, auth, signOut } from './firebase-config.js';
import { onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ★★★ 身份驗證與白名單檢查 ★★★
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 檢查是否在白名單內
        const snapshot = await get(ref(db, `admins`));
        let isAdmin = false;
        if (snapshot.exists()) {
            const admins = snapshot.val();
            for (let key in admins) {
                if (admins[key] === user.email) {
                    isAdmin = true;
                    break;
                }
            }
        }

        if (isAdmin) {
            document.body.style.display = 'block'; // 驗證通過才顯示內容
        } else {
            alert("權限不足：您的帳號不在管理員白名單中！");
            await signOut(auth);
            window.location.href = "index.html";
        }
    } else {
        // 未登入，踢回首頁
        alert("請先從首頁登入管理員帳號！");
        window.location.href = "index.html";
    }
});

// 綁定登出函數到全域
window.logoutAdmin = async function () {
    try {
        await signOut(auth);
        window.location.href = "index.html";
    } catch (error) {
        console.error("登出發生錯誤:", error);
    }
};

// ★★★ 防偷跑與時間校準 ★★★
let serverTimeOffset = 0;
onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
    serverTimeOffset = snap.val() || 0;
});

// ★★★ 防閃爍快照變數 ★★★
let currentCourseListStr = "";
let currentClassSelectorStr = "";
let currentWaitlistSelectorStr = "";

tinymce.init({
    selector: '#c_desc',
    plugins: 'image link lists media table code',
    toolbar: 'undo redo | code | fontfamily fontsize | forecolor backcolor | formatselect | bold italic | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | image',
    height: 400,
    menubar: true
});

const classrooms = {
    "high_red": { name: "高中紅教室", layout: [["1-1:X", "1-2:X", "_", "1-3", "1-4", "1-5", "_", "1-6", "1-7", "1-8", "_", "1-9:X", "1-10:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7", "2-8", "_", "2-9", "2-10"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7", "3-8", "_", "3-9", "3-10"], ["4-1", "4-2", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7", "4-8", "_", "4-9", "4-10"], ["5-1", "5-2", "_", "5-3", "5-4", "5-5", "_", "5-6", "5-7", "5-8", "_", "5-9", "5-10"], ["6-1", "6-2", "_", "6-3", "6-4", "6-5", "_", "6-6", "6-7", "6-8", "_", "6-9", "6-10"], ["7-1:X", "7-2:X", "_", "7-3:X", "7-4:X", "7-5:X", "_", "7-6:X", "7-7:X", "7-8:X", "_", "7-9:X", "7-10:X"], ["8-1:X", "8-2:X", "_", "8-3:X", "8-4:X", "8-5:X", "_", "8-6:X", "8-7:X", "8-8:X", "_", "_", "DOOR"]] },
    "high_orange": { name: "高中橘教室", layout: [["1-1:X", "1-2:X", "_", "1-3", "1-4", "1-5", "_", "1-6", "1-7", "1-8", "_", "1-9:X", "1-10:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7", "2-8", "_", "2-9", "2-10"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7", "3-8", "_", "3-9", "3-10"], ["4-1", "4-2", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7", "4-8", "_", "4-9", "4-10"], ["5-1", "5-2", "_", "5-3", "5-4", "5-5", "_", "5-6", "5-7", "5-8", "_", "5-9", "5-10"], ["6-1", "6-2", "_", "6-3", "6-4", "6-5", "_", "6-6", "6-7", "6-8", "_", "6-9", "6-10"], ["_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "DOOR"]] },
    "high_green": { name: "高中綠教室", layout: [["1-1:X", "1-2", "_", "1-3", "1-4", "1-5", "_", "1-6:X", "1-7:X", "1-8:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7", "2-8"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7", "3-8"], ["4-1", "4-2", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7", "4-8"], ["5-1", "5-2", "_", "5-3", "5-4", "5-5", "_", "5-6", "5-7", "5-8"], ["6-1:X", "6-2:X", "_", "6-3:X", "6-4:X", "6-5:X", "_", "_", "_", "DOOR"]] },
    "high_yellow": { name: "高中黃教室", layout: [["1-1", "1-2:X", "_", "1-3", "1-4", "1-5", "_", "1-6:X", "1-7:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7"], ["DOOR", "_", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7"], ["_", "_", "_", "5-3:X", "5-4:X", "5-5:X", "_", "5-6:X", "5-7:X"], ["_", "_", "_", "_", "_", "_", "_", "_", "_"]] },
    "high_blue": { name: "高中藍教室", layout: [["1-1:X", "1-2", "_", "1-3", "1-4", "1-5", "_", "1-6:X", "1-7:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7"], ["4-1", "4-2", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7"], ["5-1:X", "5-2:X", "_", "5-3:X", "5-4:X", "_", "_", "5-6:X", "5-7:X"], ["6-1:X", "6-2:X", "_", "_", "DOOR", "_", "_", "_", "_"]] },
    "middle_new_orange": { name: "國中新橘教室", layout: [["1-1:X", "1-2", "_", "1-3", "1-4", "1-5", "_", "1-6", "1-7", "1-8:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7", "2-8"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7", "3-8"], ["4-1", "4-2", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7", "4-8:X"], ["DOOR", "_", "_", "5-3", "5-4", "5-5", "_", "5-6", "5-7", "PILLAR"]] },
    "middle_new_blue": { name: "國中新藍教室", layout: [["1-1", "1-2", "1-3", "_", "1-4", "1-5", "1-6", "1-7:X"], ["2-1", "2-2", "2-3", "_", "2-4", "2-5", "2-6", "2-7:X"], ["3-1", "3-2", "3-3", "_", "3-4", "3-5", "3-6", "3-7:X"], ["4-1", "4-2", "4-3", "_", "4-4", "4-5", "4-6", "4-7:X"], ["5-1", "5-2", "5-3", "_", "5-4", "5-5", "5-6", "5-7:X"], ["6-1:X", "6-2:X", "6-3:X", "_", "6-4:X", "6-5:X", "6-6:X", "6-7:X"], ["7-1:X", "7-2:X", "7-3:X", "_", "7-4:X", "7-5:X", "7-6:X", "7-7:X"], ["DOOR", "_", "_", "_", "_", "_", "_", "_"]] },
    "middle_new_yellow": { name: "國中新黃教室", layout: [["1-1:X", "1-2", "1-3", "_", "1-4", "1-5", "1-6", "_", "1-7", "1-8:X"], ["PILLAR", "2-2", "2-3", "_", "2-4", "2-5", "2-6", "_", "2-7", "2-8:X"], ["3-1:X", "3-2", "3-3", "_", "3-4", "3-5", "3-6", "_", "3-7", "3-8"], ["4-1", "4-2", "4-3", "_", "4-4", "4-5", "4-6", "_", "4-7", "4-8"], ["5-1", "5-2", "5-3", "_", "5-4", "5-5", "5-6", "_", "5-7", "5-8"], ["6-1:X", "6-2", "6-3", "_", "6-4", "6-5", "6-6", "_", "6-7", "6-8"], ["DOOR", "_", "_", "_", "_", "_", "_", "_", "_", "_"]] },
    "middle_new_red": { name: "國中新紅教室", layout: [["1-1", "1-2:X", "1-3", "_", "1-4", "1-5", "1-6", "1-7", "_", "1-8", "1-9:X", "1-10:X"], ["2-1", "2-2", "2-3", "_", "2-4", "2-5", "2-6", "2-7", "_", "2-8", "2-9", "2-10"], ["3-1", "3-2", "3-3", "_", "3-4", "3-5", "3-6", "3-7", "_", "3-8", "3-9", "3-10"], ["DOOR", "_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "_"], ["4-1", "4-2", "4-3", "_", "4-4", "4-5", "4-6", "4-7", "_", "4-8", "4-9", "4-10"], ["5-1", "5-2", "5-3", "_", "5-4", "5-5", "5-6", "5-7", "_", "5-8", "5-9", "5-10"], ["6-1", "6-2", "6-3", "_", "6-4", "6-5", "6-6", "6-7", "_", "6-8", "6-9", "6-10"], ["7-1", "7-2", "7-3", "_", "7-4", "7-5", "7-6", "7-7", "_", "7-8", "7-9", "7-10"], ["8-1:X", "8-2:X", "8-3:X", "_", "8-4:X", "8-5:X", "8-6:X", "8-7:X", "_", "8-8:X", "8-9:X", "8-10:X"]] },
    "middle_big_red": { name: "國中大紅教室", layout: [["1-1:X", "1-2", "_", "1-3", "1-4", "1-5", "_", "1-6", "1-7", "1-8", "_", "1-9", "1-10:X"], ["2-1", "2-2", "_", "2-3", "2-4", "2-5", "_", "2-6", "2-7", "2-8", "_", "2-9", "2-10"], ["3-1", "3-2", "_", "3-3", "3-4", "3-5", "_", "3-6", "3-7", "3-8", "_", "3-9", "3-10"], ["4-1", "4-2", "_", "4-3", "4-4", "4-5", "_", "4-6", "4-7", "4-8", "_", "4-9", "4-10"], ["5-1", "5-2", "_", "5-3", "5-4", "5-5", "_", "5-6", "5-7", "5-8", "_", "5-9", "5-10"], ["6-1", "6-2", "_", "6-3", "6-4", "6-5", "_", "6-6", "6-7", "6-8", "_", "6-9", "6-10"], ["7-1:X", "7-2:X", "_", "7-3:X", "7-4:X", "7-5:X", "_", "7-6:X", "7-7:X", "7-8:X", "_", "7-9:X", "7-10:X"], ["_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "_", "DOOR"]] },
    "middle_big_orange": { name: "國中大橘教室", layout: [["1-1:X", "1-2:X", "1-3", "_", "1-4", "1-5", "1-6", "_", "1-7", "1-8:X"], ["2-1", "2-2", "2-3", "_", "2-4", "2-5", "2-6", "_", "2-7", "2-8"], ["3-1", "3-2", "3-3", "_", "3-4", "3-5", "3-6", "_", "3-7", "3-8"], ["4-1", "4-2", "4-3", "_", "4-4", "4-5", "4-6", "_", "4-7", "4-8"], ["5-1", "5-2", "5-3", "_", "5-4", "5-5", "5-6", "_", "_", "DOOR"]] },
    "middle_big_green": { name: "國中大綠教室", layout: [["DOOR", "_", "_", "_", "_", "_"], ["1-1", "1-2", "1-3", "_", "1-4", "1-5"], ["2-1", "2-2", "2-3", "_", "2-4", "2-5"], ["3-1", "3-2", "3-3", "_", "3-4", "3-5"], ["PILLAR", "4-2", "4-3", "_", "4-4", "4-5"]] },
    "test_room": { name: "測試專用教室", layout: [["1-1", "1-2"]] }
};

let allBookings = [];
let coursesData = {};
let waitlistData = {};
let seatsData = {};
let waitlistDisplayList = [];
let schoolMap = {};
let printLayouts = {};

let billStudents = [];
let currentBillIndex = -1;

let opCourseId = null;
let opSeatId = null;
let bookingSort = { col: 'time', asc: false };
let waitlistSort = { col: 'timestamp', asc: true };

let currentEditorLayout = [];
let isEditorLocked = false;

window.switchTab = function (tabName) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tabs button').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.target.classList.add('active');
    if (tabName === 'bills') initBillPage();
    if (tabName === 'print') initPrintPage();
};
window.showCourseForm = function () {
    document.getElementById('courseListView').style.display = 'none';
    document.getElementById('courseFormView').style.display = 'block';
    resetForm();
    resetSeatEditor();
};
window.hideCourseForm = function () { document.getElementById('courseListView').style.display = 'block'; document.getElementById('courseFormView').style.display = 'none'; };

// ★★★ V36.1 更新：預覽圖片時也支援網路圖片 (從圖庫抓回來的) ★★★
window.previewImage = function (input) {
    const img = document.getElementById('imgPreview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            img.src = e.target.result;
            img.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
        document.getElementById('c_image_url').value = "";
    } else if (typeof input === 'string') {
        img.src = input;
        img.style.display = 'block';
    }
};

const subjectsByGrade = {
    "升小五課程": ["小五邏輯數學"],
    "升小六課程": ["小六資優自然", "小六資優數學"],
    "升國一課程": ["國一自然超前", "國一數學超前", "國一生物", "國一數學"],
    "升國二課程": ["國二理化"],
    "升國三課程": ["國三自然總複習", "國三數學總複習", "國三英文總複習", "國三國文總複習", "國三社會總複習"],
    "升高一課程": ["高一自然（物/化）", "高一粘立物理", "高一周逸化學", "高一黃浩數學", "高一明軒數學", "高一竹中數學", "高一小揚英文"],
    "升高二課程": ["高二粘立物理", "高二周逸化學", "高二黃浩數學", "高二明軒數學", "高二竹中數學", "高二小揚英文"],
    "升高三課程": ["高三粘立物理", "高三周逸化學", "高三黃浩數學", "高三明軒數學", "學測英文", "學測黃浩數學", "學測明軒數學", "學測自然"]
};
window.updateSubjects = function () { const grade = document.getElementById('c_grade').value; const list = document.getElementById('subject_list'); list.innerHTML = ""; if (subjectsByGrade[grade]) { subjectsByGrade[grade].forEach(s => list.innerHTML += `<option value="${s}">`); } };
window.autoFillTime = function () {
    const type = document.getElementById('c_class_type').value;
    const timeInput = document.getElementById('c_time_desc');

    if (type === "週一、四班") {
        timeInput.value = "每週一、四 16:50-18:20";
    } else if (type === "週二、五班") {
        timeInput.value = "每週二、五 16:50-18:20";
    } else if (type === "週三、六班") {
        timeInput.value = "每週三 16:50-18:20 及 每週六 08:30-10:00";
    } else if (type === "週六上午班") {
        timeInput.value = "每週六 09:00-12:00";
    } else if (type === "週六下午班") {
        timeInput.value = "每週六 13:00-16:00";
    } else if (type === "週六晚上班") {
        timeInput.value = "每週六 18:00-21:00";
    } else if (type === "週日上午班") {
        timeInput.value = "每週日 09:00-12:00";
    } else if (type === "週日下午班") {
        timeInput.value = "每週日 13:00-16:00";
    } else if (type === "週日晚上班") {
        timeInput.value = "每週日 18:00-21:00";
    }
    else if (type.includes("週")) {
        const day = type.replace("班", "").replace("週", "每週");
        timeInput.value = `${day} 18:30-21:30`;
    }
};
window.formatPrice = function (input) { let val = input.value.replace(/[^0-9]/g, ''); if (val) input.value = "$" + parseInt(val).toLocaleString(); };
window.formatDate = function (input) { const val = input.value.trim(); if (/^\d{1,2}\/\d{1,2}$/.test(val)) { const [m, d] = val.split('/'); const date = new Date(2026, m - 1, d); const weekDay = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]; const mm = m.padStart(2, '0'); const dd = d.padStart(2, '0'); input.value = `2026/${mm}/${dd} (${weekDay})`; } };

const coursesRef = ref(db, 'courses');
onValue(coursesRef, (snapshot) => {
    coursesData = snapshot.val() || {};
    renderCourseList();
    updateClassSelector();
    updateWaitlistSelector();
    updateDatalists();
    renderClassroomPreview();
});

function updateDatalists() {
    const subjects = new Set();
    Object.values(coursesData).forEach(c => {
        if (c.subject) subjects.add(c.subject);
    });
    const subList = document.getElementById('subject_list');
    subList.innerHTML = "";
    subjects.forEach(s => subList.innerHTML += `<option value="${s}">`);
}

window.resetSeatEditor = function () {
    if (isEditorLocked) {
        alert("🔒 此課程已有售出紀錄，無法重置座位表！");
        const courseId = document.getElementById('c_id').value;
        if (courseId && coursesData[courseId]) {
            document.getElementById('c_classroom').value = coursesData[courseId].classroom;
        }
        return;
    }

    const classroomType = document.getElementById('c_classroom').value;
    const config = classrooms[classroomType];
    if (!config) return;

    currentEditorLayout = JSON.parse(JSON.stringify(config.layout));
    renderEditorGrid();
};

function renderEditorGrid() {
    const grid = document.getElementById('editorGrid');
    grid.innerHTML = "";

    currentEditorLayout.forEach((row, rIndex) => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        row.forEach((code, cIndex) => {
            const seat = document.createElement('div');
            seat.className = 'seat';

            let displayCode = code;
            if (code.includes(':X')) {
                seat.classList.add('blocked');
                displayCode = code.split(':')[0];
            } else if (code === "_") {
                seat.classList.add('aisle');
            } else if (code === "DOOR") {
                seat.classList.add('door');
                seat.textContent = "門";
            } else if (code === "PILLAR") {
                seat.classList.add('pillar');
                seat.textContent = "柱";
            } else {
                seat.textContent = code;
            }

            if (!isEditorLocked) {
                seat.onclick = () => toggleSeatType(rIndex, cIndex);
            } else {
                seat.style.cursor = "not-allowed";
                seat.style.opacity = "0.7";
            }

            rowDiv.appendChild(seat);
        });
        grid.appendChild(rowDiv);
    });
}

function toggleSeatType(r, c) {
    const currentCode = currentEditorLayout[r][c];
    let newCode = currentCode;

    if (currentCode === "_") {
        const classroomType = document.getElementById('c_classroom').value;
        const originalCode = classrooms[classroomType].layout[r][c];
        const baseId = (originalCode === "_" || originalCode === "DOOR" || originalCode === "PILLAR") ? `${r + 1}-${c + 1}` : originalCode.split(':')[0];
        newCode = `${baseId}:X`;
    }
    else if (currentCode.includes(":X")) {
        newCode = "PILLAR";
    }
    else if (currentCode === "PILLAR") {
        newCode = "DOOR";
    }
    else if (currentCode === "DOOR") {
        const classroomType = document.getElementById('c_classroom').value;
        const originalCode = classrooms[classroomType].layout[r][c];
        const baseId = (originalCode === "_" || originalCode === "DOOR" || originalCode === "PILLAR") ? `${r + 1}-${c + 1}` : originalCode.split(':')[0];
        newCode = baseId;
    }
    else {
        newCode = "_";
    }

    currentEditorLayout[r][c] = newCode;
    renderEditorGrid();
}

window.saveCourse = async function () {
    const btn = document.getElementById('btnSave');
    btn.disabled = true;
    btn.textContent = "處理中...";

    try {
        const id = document.getElementById('c_id').value;
        const descContent = tinymce.get('c_desc').getContent();
        const grade = document.getElementById('c_grade').value;
        const subject = document.getElementById('c_subject').value;
        const classType = document.getElementById('c_class_type').value;
        const teacher = document.getElementById('c_teacher').value;
        const classroom = document.getElementById('c_classroom').value;
        const start1 = document.getElementById('c_start1').value;
        const end1 = document.getElementById('c_end1').value;
        const start2 = document.getElementById('c_start2').value;
        const end2 = document.getElementById('c_end2').value;
        const price = document.getElementById('c_price').value;
        const lessons = document.getElementById('c_lessons').value;
        const timeDesc = document.getElementById('c_time_desc').value;
        const startDate = document.getElementById('c_start_date').value;
        const displayStart = document.getElementById('c_display_start').value;
        const displayEnd = document.getElementById('c_display_end').value;
        const fileInput = document.getElementById('c_image_file');
        const oldImageUrl = document.getElementById('c_image_url').value;

        const waitlistEnabled = document.getElementById('c_waitlist_enabled').checked;
        const waitlistLimit = document.getElementById('c_waitlist_limit').value;

        if (!grade || !subject || !start1) throw new Error("請填寫完整資料！");

        let totalSeats = 0;
        currentEditorLayout.forEach(row => {
            row.forEach(seatCode => {
                if (seatCode !== "_" && seatCode !== "DOOR" && seatCode !== "PILLAR" && !seatCode.includes(":X")) {
                    totalSeats++;
                }
            });
        });

        let imageUrl = oldImageUrl || "https://via.placeholder.com/400x200?text=No+Image";
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const storagePath = `course_images/${Date.now()}_${file.name}`;
            const imgRef = storageRef(storage, storagePath);
            document.getElementById('uploadStatus').textContent = "上傳圖片中...";
            const metadata = { contentType: file.type };
            await uploadBytes(imgRef, file, metadata);
            imageUrl = await getDownloadURL(imgRef);
        }

        const courseData = {
            grade, subject, classType, teacher, classroom,
            start1, end1, start2, end2, price, lessons,
            timeDescription: timeDesc, startDate: startDate,
            displayStart, displayEnd, desc: descContent,
            image: imageUrl, updatedAt: Date.now(),
            waitlistEnabled: waitlistEnabled,
            waitlistLimit: parseInt(waitlistLimit) || 0,
            totalSeats: totalSeats,
            layout: currentEditorLayout
        };

        let courseId = id;
        if (id) {
            await update(ref(db, `courses/${id}`), courseData);
            alert("✅ 課程更新成功！座位表已同步更新。");
        } else {
            const newRef = push(coursesRef);
            courseId = newRef.key;
            courseData.createdAt = Date.now();
            await set(newRef, courseData);
            alert("✅ 課程新增成功！座位表已建立。");
        }

        const start1Time = new Date(start1).getTime();
        const end1Time = end1 ? new Date(end1).getTime() : 9999999999999;
        const start2Time = start2 ? new Date(start2).getTime() : 9999999999999;
        const end2Time = end2 ? new Date(end2).getTime() : 9999999999999;

        await set(ref(db, `seats/${courseId}/_settings`), {
            start1: start1Time,
            end1: end1Time,
            start2: start2Time,
            end2: end2Time
        });

        hideCourseForm();

    } catch (err) {
        alert("錯誤：" + err.message);
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = id ? "確認更新課程" : "確認新增課程";
    }
};

window.editCourse = function (key) {
    const c = coursesData[key];
    showCourseForm();
    document.getElementById('formTitle').textContent = "✏️ 編輯課程";
    document.getElementById('btnSave').textContent = "確認更新課程";

    document.getElementById('c_id').value = key;
    document.getElementById('c_grade').value = c.grade;
    document.getElementById('c_subject').value = c.subject;
    document.getElementById('c_class_type').value = c.classType || "";
    document.getElementById('c_teacher').value = c.teacher;
    document.getElementById('c_classroom').value = c.classroom;
    document.getElementById('c_start1').value = c.start1;
    document.getElementById('c_end1').value = c.end1 || "";
    document.getElementById('c_start2').value = c.start2 || "";
    document.getElementById('c_end2').value = c.end2 || "";
    document.getElementById('c_price').value = c.price;
    document.getElementById('c_lessons').value = c.lessons || "12";
    document.getElementById('c_time_desc').value = c.timeDescription || "";
    document.getElementById('c_start_date').value = c.startDate || "";
    document.getElementById('c_display_start').value = c.displayStart || "";
    document.getElementById('c_display_end').value = c.displayEnd || "";

    document.getElementById('c_image_url').value = c.image;
    window.previewImage(c.image);

    document.getElementById('c_waitlist_enabled').checked = c.waitlistEnabled || false;
    document.getElementById('c_waitlist_limit').value = c.waitlistLimit || 0;

    tinymce.get('c_desc').setContent(c.desc);

    const courseSeats = seatsData[key] || {};
    let hasSold = false;
    Object.values(courseSeats).forEach(s => {
        if (s.status === 'sold') hasSold = true;
    });

    isEditorLocked = hasSold;
    const lockMsg = document.getElementById('editorLockMsg');
    const classroomSelect = document.getElementById('c_classroom');

    if (hasSold) {
        lockMsg.style.display = 'block';
        classroomSelect.disabled = true;
    } else {
        lockMsg.style.display = 'none';
        classroomSelect.disabled = false;
    }

    if (c.layout) {
        currentEditorLayout = JSON.parse(JSON.stringify(c.layout));
    } else {
        const config = classrooms[c.classroom];
        if (config) {
            currentEditorLayout = JSON.parse(JSON.stringify(config.layout));
        }
    }
    renderEditorGrid();
};

window.resetForm = function () {
    document.getElementById('formTitle').textContent = "➕ 新增課程";
    document.getElementById('btnSave').textContent = "確認新增課程";
    document.querySelectorAll('input:not([type="password"])').forEach(i => i.value = '');
    document.getElementById('c_lessons').value = "12";
    document.getElementById('c_price').value = "21600";
    document.getElementById('c_waitlist_enabled').checked = false;
    document.getElementById('c_waitlist_limit').value = "0";
    tinymce.get('c_desc').setContent('');
    document.getElementById('uploadStatus').textContent = "";
    document.getElementById('imgPreview').style.display = 'none';

    isEditorLocked = false;
    document.getElementById('editorLockMsg').style.display = 'none';
    document.getElementById('c_classroom').disabled = false;
};

function renderCourseList() {
    const newDataStr = JSON.stringify(coursesData);
    if (currentCourseListStr === newDataStr) return;
    currentCourseListStr = newDataStr;

    const listDiv = document.getElementById('courseList');
    listDiv.innerHTML = "";
    Object.keys(coursesData).forEach(key => {
        const c = coursesData[key];
        const card = document.createElement('div');
        card.className = 'admin-course-card';
        card.onclick = (e) => { if (!e.target.classList.contains('btn-delete')) editCourse(key); };
        card.innerHTML = `
                    <div class="card-thumb" style="background-image: url('${c.image}');"></div>
                    <div class="card-content">
                        <h3>[${c.grade}] ${c.subject} ${c.classType || ''}</h3>
                        <p>👨‍🏫 ${c.teacher} | ⏰ ${c.timeDescription || '-'}</p>
                    </div>
                    <button class="btn-delete" onclick="window.deleteCourse('${key}', event)">刪除</button>
                `;
        listDiv.appendChild(card);
    });
}

window.deleteCourse = function (courseId, event) {
    if (event) event.stopPropagation();
    if (confirm("⚠️ 確定要刪除？")) remove(ref(db, `courses/${courseId}`));
};

const allSeatsRef = ref(db, 'seats');
onValue(allSeatsRef, (snapshot) => {
    seatsData = snapshot.val() || {};
    allBookings = [];
    Object.keys(seatsData).forEach(courseId => {
        const seats = seatsData[courseId];
        const c = coursesData[courseId];
        const courseName = c ? `[${c.grade}] ${c.subject} ${c.classType || ''}` : courseId;
        Object.keys(seats).forEach(seatId => {
            if (seatId === '_settings') return;
            const info = seats[seatId];
            if (info.status === 'sold' || info.status === 'locked' || info.status === 'deleted') {
                allBookings.push({
                    courseId, courseName, seatId, status: info.status,
                    studentName: info.studentName || '-', parentPhone: info.parentPhone || '-',
                    time: info.soldTime || '-', rawTime: info.timestamp,
                    orderId: info.orderId || '-'
                });
            }
        });
    });
    renderTable();
    updateStats();
    loadVisualMap();
});

window.sortBookingTable = function (col) {
    if (bookingSort.col === col) bookingSort.asc = !bookingSort.asc;
    else { bookingSort.col = col; bookingSort.asc = true; }
    renderTable();
};

function renderTable() {
    const filterId = document.getElementById('classSelector').value;
    const searchText = document.getElementById('searchInput').value.trim().toLowerCase();
    const tbody = document.getElementById('bookingTable');
    tbody.innerHTML = "";

    let displayList = allBookings.filter(b => {
        if (filterId !== 'all' && b.courseId !== filterId) return false;
        if (searchText && !b.studentName.includes(searchText) && !b.parentPhone.includes(searchText) && !b.orderId.includes(searchText)) return false;
        return true;
    });

    displayList.sort((a, b) => {
        let valA = a[bookingSort.col] || '';
        let valB = b[bookingSort.col] || '';
        if (bookingSort.col === 'time') {
            valA = a.rawTime || Date.parse(a.time) || 0;
            valB = b.rawTime || Date.parse(b.time) || 0;
        }
        if (valA < valB) return bookingSort.asc ? -1 : 1;
        if (valA > valB) return bookingSort.asc ? 1 : -1;
        return 0;
    });

    const nameCounts = {};
    const phoneCounts = {};
    displayList.forEach(b => {
        if (b.status === 'sold') {
            nameCounts[b.studentName] = (nameCounts[b.studentName] || 0) + 1;
            phoneCounts[b.parentPhone] = (phoneCounts[b.parentPhone] || 0) + 1;
        }
    });

    displayList.forEach(b => {
        const tr = document.createElement('tr');
        let statusBadge = '';
        let btnText = '釋出';
        let btnClass = 'danger';

        if (b.status === 'sold') {
            statusBadge = '<span class="badge sold">已劃位</span>';
            if (nameCounts[b.studentName] > 1 || phoneCounts[b.parentPhone] > 1) {
                tr.classList.add('duplicate-row');
            }
        } else if (b.status === 'locked') {
            statusBadge = '<span class="badge locked">填寫中</span>';
        } else if (b.status === 'deleted') {
            statusBadge = '<span class="badge deleted">已釋出</span>';
            tr.classList.add('row-deleted');
            btnText = '永久刪除';
            btnClass = 'dark';
        }

        tr.innerHTML = `<td>${b.orderId}</td><td>${b.courseName}</td><td>${b.time}</td><td>${statusBadge}</td><td>${b.seatId}</td><td>${b.studentName}</td><td>${b.parentPhone}</td>
                <td>
                    <button class="warning" style="padding:5px 10px; font-size:12px;" onclick="window.editOrder('${b.courseId}', '${b.seatId}', '${b.parentPhone}', '${b.orderId}', '${b.studentName}')">編輯</button>
                    <button class="${btnClass}" style="padding:5px 10px; font-size:12px;" onclick="window.releaseSeat('${b.courseId}', '${b.seatId}', '${b.status}')">${btnText}</button>
                </td>`;
        tbody.appendChild(tr);
    });
}

window.loadVisualMap = function () {
    const courseId = document.getElementById('classSelector').value;
    const mapContainer = document.getElementById('visualMap');
    const mapContent = document.getElementById('mapContent');

    if (courseId === 'all' || !coursesData[courseId]) {
        mapContainer.style.display = 'none';
        return;
    }

    mapContainer.style.display = 'block';
    mapContent.innerHTML = "";

    const c = coursesData[courseId];
    let layoutToRender = [];

    if (c.layout) {
        layoutToRender = c.layout;
    } else {
        const config = classrooms[c.classroom];
        if (config) layoutToRender = config.layout;
    }

    const currentSeats = seatsData[courseId] || {};

    if (layoutToRender && layoutToRender.length > 0) {
        layoutToRender.forEach(row => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'row';
            row.forEach(seatCode => {
                const seat = document.createElement('div');
                seat.className = 'seat';
                let code = seatCode;
                let isBlocked = false;
                if (seatCode.includes(':X')) { code = seatCode.split(':')[0]; isBlocked = true; }

                if (code === "_") seat.classList.add('aisle');
                else if (code === "DOOR") { seat.textContent = "門"; seat.classList.add('aisle'); }
                else if (code === "PILLAR") { seat.textContent = "柱"; seat.classList.add('aisle'); }
                else {
                    seat.textContent = code;
                    const info = currentSeats[code];

                    if (info) {
                        if (info.status === 'sold') {
                            seat.classList.add('sold');
                            seat.innerHTML += `<div class="seat-tooltip">${info.studentName}<br>${info.parentPhone}</div>`;
                        } else if (info.status === 'locked') {
                            seat.classList.add('locked');
                            if (info.user === 'admin_reserved') {
                                seat.classList.add('reserved');
                                seat.innerHTML += `<div class="seat-tooltip">保留位</div>`;
                            } else {
                                seat.innerHTML += `<div class="seat-tooltip">填寫中...</div>`;
                            }
                        }
                    }

                    seat.onclick = () => toggleReserve(courseId, code, info);
                }
                rowDiv.appendChild(seat);
            });
            mapContent.appendChild(rowDiv);
        });
    }
};

window.toggleReserve = async function (courseId, seatId, info) {
    if (info && info.status === 'sold') {
        if (confirm(`確定要釋出 ${seatId} (${info.studentName}) 嗎？`)) {
            update(ref(db, `seats/${courseId}/${seatId}`), {
                status: 'deleted'
            });
        }
    } else if (info && info.status === 'locked' && info.user === 'admin_reserved') {
        openOpModal(courseId, seatId);
    } else if (!info || (info && info.status === 'deleted')) {
        const snap = await get(ref(db, `seats/${courseId}/${seatId}`));
        if (snap.exists() && snap.val().status === 'sold') {
            if (!confirm("⚠️ 警告：這個位子剛剛被學生搶走了！確定要強制覆蓋嗎？")) return;
        }

        if (confirm(`要將 ${seatId} 設為保留位嗎？(前台顯示為填寫中)`)) {
            set(ref(db, `seats/${courseId}/${seatId}`), {
                status: 'locked',
                user: 'admin_reserved',
                timestamp: Date.now()
            }).catch(err => {
                alert("保留失敗：密碼錯誤或權限不足！");
            });
        }
    }
};

window.openOpModal = function (courseId, seatId) {
    opCourseId = courseId;
    opSeatId = seatId;
    document.getElementById('opTarget').textContent = `座位：${seatId}`;
    document.getElementById('opModal').style.display = 'flex';
};

window.closeOpModal = function () {
    document.getElementById('opModal').style.display = 'none';
    opCourseId = null;
    opSeatId = null;
};

window.confirmOpRelease = function () {
    if (!opCourseId || !opSeatId) return;
    set(ref(db, `seats/${opCourseId}/${opSeatId}`), null).then(() => {
        closeOpModal();
    });
};

window.confirmOpSell = function () {
    if (!opCourseId || !opSeatId) return;
    const name = prompt("請輸入學生姓名 (留空則為'現場保留')", "現場保留");
    const phone = prompt("請輸入家長電話 (留空則為'0000000000')", "0000000000");

    const orderId = "ADMIN_" + Date.now();
    const seatData = {
        status: 'sold',
        studentName: name,
        parentPhone: phone,
        soldTime: new Date().toLocaleString(),
        timestamp: Date.now(),
        orderId: orderId
    };

    set(ref(db, `seats/${opCourseId}/${opSeatId}`), seatData).then(() => {
        alert("已成功轉為已售出！");
        closeOpModal();
    }).catch(err => alert("失敗：" + err.message));
};

function updateClassSelector() {
    const optionsData = Object.keys(coursesData).map(k => `${k}-${coursesData[k].grade}-${coursesData[k].subject}-${coursesData[k].classType}`).join('|');
    if (currentClassSelectorStr === optionsData) return;
    currentClassSelectorStr = optionsData;

    const selector = document.getElementById('classSelector');
    const currentVal = selector.value;
    selector.innerHTML = '<option value="all">全部課程總覽</option>';
    Object.keys(coursesData).forEach(key => {
        const c = coursesData[key];
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `[${c.grade}] ${c.subject} ${c.classType || ''}`;
        selector.appendChild(option);
    });
    selector.value = currentVal;
}

window.releaseSeat = function (courseId, seatId, currentStatus) {
    if (currentStatus === 'deleted') {
        if (confirm("⚠️ 確定要【永久刪除】此紀錄嗎？刪除後無法復原。")) {
            set(ref(db, `seats/${courseId}/${seatId}`), null);
        }
    } else {
        if (confirm("確定釋出座位？(資料將保留並標記為已釋出)")) {
            update(ref(db, `seats/${courseId}/${seatId}`), {
                status: 'deleted'
            });
        }
    }
};

window.editOrder = async function (courseId, seatId, oldPhone, orderId, oldName) {
    const newName = prompt("修改學生姓名：", oldName);
    if (newName === null) return;
    const newPhone = prompt("修改家長電話 (若修改電話，系統將自動搬移訂單)：", oldPhone);
    if (newPhone === null) return;

    try {
        const seatUpdate = {
            studentName: newName,
            parentPhone: newPhone
        };
        await update(ref(db, `seats/${courseId}/${seatId}`), seatUpdate);

        if (newPhone !== oldPhone) {
            const oldOrderRef = ref(db, `orders/${oldPhone}/${orderId}`);
            const snap = await get(oldOrderRef);
            if (snap.exists()) {
                const orderData = snap.val();
                orderData.studentName = newName;
                orderData.parentPhone = newPhone;
                await set(ref(db, `orders/${newPhone}/${orderId}`), orderData);
                await remove(oldOrderRef);
            }
        } else {
            await update(ref(db, `orders/${oldPhone}/${orderId}`), {
                studentName: newName
            });
        }
        alert("修改成功！");
    } catch (err) {
        alert("修改失敗：" + err.message);
        console.error(err);
    }
};

function updateStats() {
    document.getElementById('totalSold').textContent = allBookings.filter(b => b.status === 'sold').length;
}

window.exportBookingCSV = function () {
    const filterId = document.getElementById('classSelector').value;
    let csv = "\uFEFF訂單編號,課程,時間,狀態,座位,姓名,電話\n";
    allBookings.forEach(b => {
        if (filterId !== 'all' && b.courseId !== filterId) return;
        let statusText = b.status === 'sold' ? '已劃位' : (b.status === 'deleted' ? '已釋出' : '填寫中');
        csv += `'${b.orderId},${b.courseName},${b.time},${statusText},${b.seatId},${b.studentName},'${b.parentPhone}\n`;
    });
    downloadCSV(csv, "booking_data.csv");
};

window.exportWaitlistCSV = function () {
    const filterId = document.getElementById('waitlistSelector').value;
    let csv = "\uFEFF課程,登記時間,狀態,序號,姓名,電話,備註\n";

    const list = waitlistData[filterId] || {};
    const c = coursesData[filterId];
    const courseName = c ? `[${c.grade}] ${c.subject} ${c.classType || ''}` : filterId;

    let exportList = Object.keys(list).map(key => ({ ...list[key], key, courseName }));
    const activeItems = exportList.filter(w => w.status !== 'deleted');
    activeItems.sort((a, b) => a.timestamp - b.timestamp);
    const rankMap = {};
    activeItems.forEach((item, index) => { rankMap[item.key] = index + 1; });

    exportList.forEach(w => {
        let seq = rankMap[w.key] || '-';
        let statusText = w.status === 'deleted' ? '已刪除' : '候補中';
        csv += `${w.courseName},${new Date(w.timestamp).toLocaleString()},${statusText},${seq},${w.studentName},'${w.parentPhone},${w.note || ''}\n`;
    });
    downloadCSV(csv, "waitlist_data.csv");
};

function downloadCSV(content, fileName) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
}

document.getElementById('classSelector').addEventListener('change', () => {
    const sel = document.getElementById('classSelector');
    document.getElementById('currentClassName').textContent = sel.options[sel.selectedIndex].text;
    renderTable();
    loadVisualMap();
});
document.getElementById('searchInput').addEventListener('input', renderTable);

const bannersRef = ref(db, 'banners');
onValue(bannersRef, (snapshot) => {
    const data = snapshot.val() || {};
    const list = document.getElementById('bannerList');
    list.innerHTML = "";
    Object.keys(data).forEach(key => {
        const b = data[key];
        const item = document.createElement('div');
        item.className = 'banner-item';
        item.innerHTML = `<img src="${b.url}"><button class="btn-delete" onclick="window.deleteBanner('${key}', event)">刪除</button>`;
        list.appendChild(item);
    });
});

window.uploadBanner = async function () {
    const fileInput = document.getElementById('b_file');
    if (fileInput.files.length === 0) return alert("請選擇圖片");
    const file = fileInput.files[0];
    const storagePath = `banners/${Date.now()}_${file.name}`;
    const imgRef = storageRef(storage, storagePath);
    document.getElementById('bannerStatus').textContent = "上傳中...";
    const metadata = { contentType: file.type };
    await uploadBytes(imgRef, file, metadata);
    const url = await getDownloadURL(imgRef);
    await push(bannersRef, { url: url, createdAt: Date.now() });
    document.getElementById('bannerStatus').textContent = "";
    fileInput.value = "";
};

window.deleteBanner = function (key, event) {
    if (event) event.stopPropagation();
    if (confirm("確定刪除此首頁橫幅？")) remove(ref(db, `banners/${key}`));
};

const waitlistRef = ref(db, 'waitlist');
onValue(waitlistRef, (snapshot) => {
    waitlistData = snapshot.val() || {};
    updateWaitlistSelector();
    renderWaitlistTable();
});

function updateWaitlistSelector() {
    const optionsData = Object.keys(coursesData).map(k => `${k}-${coursesData[k].grade}-${coursesData[k].subject}-${coursesData[k].classType}`).join('|');
    if (currentWaitlistSelectorStr === optionsData) return;
    currentWaitlistSelectorStr = optionsData;

    const selector = document.getElementById('waitlistSelector');
    const currentVal = selector.value;
    selector.innerHTML = '<option value="all">選擇課程查看候補</option>';
    Object.keys(coursesData).forEach(key => {
        const c = coursesData[key];
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `[${c.grade}] ${c.subject} ${c.classType || ''}`;
        selector.appendChild(option);
    });
    selector.value = currentVal;
}

window.sortWaitlistTable = function (col) {
    if (waitlistSort.col === col) waitlistSort.asc = !waitlistSort.asc;
    else { waitlistSort.col = col; waitlistSort.asc = true; }
    renderWaitlistTable();
};

function renderWaitlistTable() {
    const filterId = document.getElementById('waitlistSelector').value;
    const tbody = document.getElementById('waitlistTable');
    tbody.innerHTML = "";

    waitlistDisplayList = [];

    if (filterId === 'all') {
        tbody.innerHTML = "<tr><td colspan='8' style='text-align:center;'>請選擇特定課程以查看排序與序號</td></tr>";
        return;
    }

    const list = waitlistData[filterId] || {};
    const c = coursesData[filterId];
    const courseName = c ? `[${c.grade}] ${c.subject} ${c.classType || ''}` : filterId;

    waitlistDisplayList = Object.keys(list).map(key => ({
        ...list[key],
        key,
        courseName
    }));

    const activeItems = waitlistDisplayList.filter(w => w.status !== 'deleted');
    activeItems.sort((a, b) => a.timestamp - b.timestamp);
    const rankMap = {};
    activeItems.forEach((item, index) => {
        rankMap[item.key] = index + 1;
    });

    waitlistDisplayList.sort((a, b) => {
        if (waitlistSort.col === 'seq') {
            const rankA = rankMap[a.key] || 999999;
            const rankB = rankMap[b.key] || 999999;
            return waitlistSort.asc ? rankA - rankB : rankB - rankA;
        }

        let valA = a[waitlistSort.col] || '';
        let valB = b[waitlistSort.col] || '';
        if (valA < valB) return waitlistSort.asc ? -1 : 1;
        if (valA > valB) return waitlistSort.asc ? 1 : -1;
        return 0;
    });

    const nameCounts = {};
    const phoneCounts = {};
    waitlistDisplayList.forEach(w => {
        if (w.status !== 'deleted') {
            nameCounts[w.studentName] = (nameCounts[w.studentName] || 0) + 1;
            phoneCounts[w.parentPhone] = (phoneCounts[w.parentPhone] || 0) + 1;
        }
    });

    waitlistDisplayList.forEach(w => {
        const tr = document.createElement('tr');
        const time = new Date(w.timestamp).toLocaleString();

        let btnText = '刪除';
        let btnClass = 'danger';
        let statusBadge = '<span class="badge wait">候補中</span>';
        let seqDisplay = rankMap[w.key] || '-';

        if (w.status === 'deleted') {
            tr.classList.add('row-deleted');
            btnText = '永久刪除';
            btnClass = 'dark';
            statusBadge = '<span class="badge deleted">已刪除</span>';
        } else {
            if (nameCounts[w.studentName] > 1 || phoneCounts[w.parentPhone] > 1) {
                tr.classList.add('duplicate-row');
            }
        }

        tr.innerHTML = `
                    <td>${courseName}</td>
                    <td>${time}</td>
                    <td>${statusBadge}</td>
                    <td style="font-weight:bold; color:#d35400;">${seqDisplay}</td>
                    <td>${w.studentName}</td>
                    <td>${w.parentPhone}</td>
                    <td>${w.note || '-'}</td>
                    <td>
                        <button class="warning" style="padding:5px 10px; font-size:12px;" onclick="window.editWaitlist('${filterId}', '${w.key}', '${w.studentName}', '${w.parentPhone}', '${w.note}')">編輯</button>
                        <button class="${btnClass}" style="padding:5px 10px; font-size:12px;" onclick="window.deleteWaitlist('${filterId}', '${w.key}', '${w.status}')">${btnText}</button>
                    </td>`;
        tbody.appendChild(tr);
    });
}

window.deleteWaitlist = function (courseId, waitlistId, currentStatus) {
    if (currentStatus === 'deleted') {
        if (confirm("確定要【永久刪除】此候補嗎？")) {
            set(ref(db, `waitlist/${courseId}/${waitlistId}`), null);
        }
    } else {
        if (confirm("確定移除此候補？(資料將保留，序號將釋出)")) {
            update(ref(db, `waitlist/${courseId}/${waitlistId}`), {
                status: 'deleted'
            });
        }
    }
};

window.editWaitlist = function (courseId, waitlistId, oldName, oldPhone, oldNote) {
    const newName = prompt("修改姓名", oldName);
    const newPhone = prompt("修改電話", oldPhone);
    const newNote = prompt("修改備註", oldNote);

    if (newName && newPhone) {
        update(ref(db, `waitlist/${courseId}/${waitlistId}`), {
            studentName: newName,
            parentPhone: newPhone,
            note: newNote
        }).then(() => alert("修改成功")).catch(e => alert("修改失敗：" + e.message));
    }
};

document.getElementById('waitlistSelector').addEventListener('change', renderWaitlistTable);

function renderClassroomPreview() {
    const list = document.getElementById('classroomList');
    list.innerHTML = "";
    Object.keys(classrooms).forEach(key => {
        const c = classrooms[key];
        const card = document.createElement('div');
        card.className = 'classroom-card';
        card.innerHTML = `<h4>${c.name}</h4><div style="font-size:12px; color:#666;">代碼: ${key}</div>`;
        card.onclick = () => showPreview(key);
        list.appendChild(card);
    });
}

window.showPreview = function (key) {
    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const content = document.getElementById('previewContent');
    const config = classrooms[key];

    title.textContent = config.name;
    content.innerHTML = "";

    config.layout.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        row.forEach(seatCode => {
            const seat = document.createElement('div');
            seat.className = 'seat';
            let code = seatCode;
            if (seatCode.includes(':X')) { code = seatCode.split(':')[0]; seat.classList.add('blocked'); }
            if (code === "_") seat.classList.add('aisle');
            else if (code === "DOOR") { seat.textContent = "門"; seat.classList.add('aisle'); }
            else if (code === "PILLAR") { seat.textContent = "柱"; seat.classList.add('aisle'); }
            else seat.textContent = code;
            rowDiv.appendChild(seat);
        });
        content.appendChild(rowDiv);
    });

    modal.style.display = "flex";
};

window.closePreview = function () {
    document.getElementById('previewModal').style.display = "none";
};

renderClassroomPreview();

const ZOMBIE_TIMEOUT = 2.5 * 60 * 1000;
const SWEEP_INTERVAL = 10 * 1000;

function startZombieSweeper() {
    const statusDiv = document.getElementById('sweeperStatus');

    setInterval(() => {
        const now = Date.now() + serverTimeOffset;
        let clearedCount = 0;

        Object.keys(seatsData).forEach(courseId => {
            const seats = seatsData[courseId];
            Object.keys(seats).forEach(seatId => {
                if (seatId === '_settings') return;
                const info = seats[seatId];

                if (info.status === 'locked' && info.user !== 'admin_reserved') {
                    if (now - info.timestamp > ZOMBIE_TIMEOUT) {
                        set(ref(db, `seats/${courseId}/${seatId}`), null);
                        clearedCount++;
                        console.log(`[Sweeper] 清除殭屍座位: ${courseId} - ${seatId}`);
                    }
                }
            });
        });

        if (clearedCount > 0) {
            statusDiv.textContent = `🧹 剛剛清除了 ${clearedCount} 個殭屍座位`;
            statusDiv.style.backgroundColor = "#e74c3c";
            setTimeout(() => {
                statusDiv.textContent = "🧹 殭屍清除器：待命";
                statusDiv.style.backgroundColor = "rgba(0,0,0,0.7)";
            }, 3000);
        }
    }, SWEEP_INTERVAL);
}

startZombieSweeper();

window.initBillPage = function () {
    window.renderCourseConfig();
    window.processBills();
};

onValue(ref(db, 'print_layouts'), (snapshot) => {
    printLayouts = snapshot.val() || {};
    if (document.getElementById('tab-print').classList.contains('active')) {
        updatePrintCourseList();
    }
});

window.renderCourseConfig = function () {
    const container = document.getElementById('courseConfigList');
    container.innerHTML = "";
    const billType = document.getElementById('billTypeSelector').value;

    Object.keys(coursesData).forEach(key => {
        const c = coursesData[key];
        const isSeniorCourse = c.grade.includes("高");
        if (billType === 'senior' && !isSeniorCourse) return;
        if (billType === 'junior' && isSeniorCourse) return;

        const div = document.createElement('div');
        div.className = "config-row";
        div.innerHTML = `
                    <input type="checkbox" id="bill_check_${key}" style="margin-right:10px;" checked onchange="window.processBills()">
                    <span style="font-weight:bold; display:inline-block; width:200px;">${c.subject}</span>
                    <input type="text" id="bill_date_${key}" placeholder="日期 (如 3/5)" style="width:80px;" value="${c.billDate || ''}">
                    <input type="text" id="bill_count_${key}" placeholder="堂數 (如 12)" style="width:60px;" value="${c.billCount || ''}">
                    <input type="text" id="bill_price_${key}" placeholder="金額" style="width:80px;" value="${c.billPrice || c.price.replace(/[$,]/g, '')}">
                    <input type="text" id="bill_note_${key}" placeholder="備註 (選填)" style="width:150px;" value="${c.billNote || ''}">
                `;
        container.appendChild(div);
    });

    window.processBills();
};

window.saveAllBillConfigs = function () {
    const updates = {};
    Object.keys(coursesData).forEach(key => {
        if (document.getElementById(`bill_date_${key}`)) {
            const date = document.getElementById(`bill_date_${key}`).value;
            const count = document.getElementById(`bill_count_${key}`).value;
            const price = document.getElementById(`bill_price_${key}`).value;
            const note = document.getElementById(`bill_note_${key}`).value;

            updates[`courses/${key}/billDate`] = date;
            updates[`courses/${key}/billCount`] = count;
            updates[`courses/${key}/billPrice`] = price;
            updates[`courses/${key}/billNote`] = note;
        }
    });

    update(ref(db), updates).then(() => {
        alert("✅ 設定已儲存！");
        window.processBills();
    }).catch(err => alert("儲存失敗：" + err.message));
};

window.importSchoolCSV = function () {
    const fileInput = document.getElementById('csvSchoolFile');
    if (fileInput.files.length === 0) return alert("請選擇 CSV 檔案");
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const lines = text.split('\n');
        let count = 0;

        if (lines.length === 0) return;

        const headers = lines[0].split(',').map(h => h.trim().replace(/["']/g, '').replace(/^\uFEFF/, ''));
        const schoolIdx = headers.findIndex(h => h.includes('學校'));
        const nameIdx = headers.findIndex(h => h.includes('姓名'));

        if (schoolIdx === -1 || nameIdx === -1) {
            return alert("❌ CSV 檔案標題列必須包含「學校」與「姓名」欄位！");
        }

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            const parts = line.split(',');
            if (parts.length > Math.max(schoolIdx, nameIdx)) {
                const school = parts[schoolIdx].trim().replace(/["']/g, '');
                const name = parts[nameIdx].trim().replace(/["']/g, '');
                if (name && school) {
                    schoolMap[name] = school;
                    count++;
                }
            }
        }
        document.getElementById('csvStatus').textContent = `✅ 已匯入 ${count} 筆學校資料`;
        window.processBills();
    };
    reader.readAsText(file);
};

window.processBills = function () {
    const billType = document.getElementById('billTypeSelector').value;
    const studentMap = {};

    const footerInfo = document.getElementById('footerInfo');
    const bankInfo = document.getElementById('bankInfo');

    if (billType === 'senior') {
        footerInfo.innerHTML = '新竹市私立山熊升大文理短期補習班 &nbsp; 地址：新竹市科學園路107巷2號B1 &nbsp; 立案字號：府教社字第1120072237號';
        bankInfo.innerHTML = '第一銀行(007) 竹科分行 &nbsp;&nbsp; 戶名：新竹市私立山熊升大文理短期補習班 &nbsp;&nbsp; 帳號：303-100-34751<br><span class="bank-highlight">★ 匯款後請告知我們上課科目、匯款金額及帳號後 5 碼以利我們對帳，謝謝。</span>';
    } else {
        footerInfo.innerHTML = '新竹市私立山熊科學文理短期補習班 &nbsp; 地址：新竹市科學園路107巷1號 &nbsp; 立案字號：府教社字第1010019608號';
        bankInfo.innerHTML = '第一銀行(007) 竹科分行 &nbsp;&nbsp; 戶名：新竹市私立山熊科學文理短期補習班 &nbsp;&nbsp; 帳號：303-100-13273<br><span class="bank-highlight">★ 匯款後請告知我們上課科目、匯款金額及帳號後 5 碼以利我們對帳，謝謝。</span>';
    }

    Object.keys(seatsData).forEach(courseId => {
        const seats = seatsData[courseId];
        const c = coursesData[courseId];
        if (!c) return;

        const checkbox = document.getElementById(`bill_check_${courseId}`);
        if (!checkbox || !checkbox.checked) return;

        const isSeniorCourse = c.grade.includes("高");
        if (billType === 'senior' && !isSeniorCourse) return;
        if (billType === 'junior' && isSeniorCourse) return;

        Object.keys(seats).forEach(seatId => {
            if (seatId === '_settings') return;
            const info = seats[seatId];
            if (info.status === 'sold') {
                const name = info.studentName;
                if (!studentMap[name]) {
                    studentMap[name] = {
                        name: name,
                        phone: info.parentPhone,
                        items: [],
                        total: 0,
                        grade: inferGrade(c.grade),
                        school: schoolMap[name] || ""
                    };
                }

                let priceInput = document.getElementById(`bill_price_${courseId}`);
                let price = priceInput ? parseInt(priceInput.value) : (parseInt(c.billPrice) || parseInt(c.price.replace(/[$,]/g, '')) || 0);

                let dateInput = document.getElementById(`bill_date_${courseId}`);
                let countInput = document.getElementById(`bill_count_${courseId}`);
                let noteInput = document.getElementById(`bill_note_${courseId}`);

                let dateVal = dateInput ? dateInput.value : (c.billDate || "");
                let countVal = countInput ? countInput.value : (c.billCount || "");
                let noteVal = noteInput ? noteInput.value : (c.billNote || "");

                studentMap[name].items.push({
                    name: c.subject + (c.classType ? ` (${c.classType})` : ''),
                    dateHtml: formatBillDate(dateVal, countVal),
                    price: price,
                    note: noteVal
                });
                studentMap[name].total += price;
            }
        });
    });

    billStudents = Object.values(studentMap);
    if (billStudents.length > 0) {
        loadBill(0);
    } else {
        document.getElementById('billName').textContent = "無資料";
        document.getElementById('billGrade').textContent = "";
        document.getElementById('billSchool').textContent = "";
        document.getElementById('billTotal').textContent = "0";
        document.getElementById('billNote').innerText = "";
        document.getElementById('itemsTable').innerHTML = "<tr><td colspan='3' style='text-align:center; padding: 20px;'>此部別目前沒有學費單資料</td></tr>";
        document.getElementById('billCounter').textContent = "0 / 0";
    }
};

function formatBillDate(dateStr, count) {
    let html = "";
    if (dateStr) {
        const parts = dateStr.split('/');
        if (parts.length === 2) {
            html += `自<span class="w-num">${parts[0]}</span><span class="d-text">月</span><span class="w-num">${parts[1]}</span><span class="d-text">日</span>起`;
        } else {
            html += dateStr;
        }
    }
    if (count) {
        html += ` 共 <span class="w-num">${count}</span> 堂`;
    }
    return html;
}

function inferGrade(gradeStr) {
    if (!gradeStr) return "";
    if (gradeStr.includes("小五")) return "五";
    if (gradeStr.includes("小六")) return "六";
    if (gradeStr.includes("國一")) return "七";
    if (gradeStr.includes("國二")) return "八";
    if (gradeStr.includes("國三")) return "九";
    if (gradeStr.includes("高一")) return "高一";
    if (gradeStr.includes("高二")) return "高二";
    if (gradeStr.includes("高三")) return "高三";
    return "";
}

window.prevBill = function () {
    if (currentBillIndex > 0) {
        loadBill(currentBillIndex - 1);
    }
};

window.nextBill = function () {
    if (currentBillIndex < billStudents.length - 1) {
        loadBill(currentBillIndex + 1);
    }
};

window.loadBill = function (index) {
    currentBillIndex = index;
    const s = billStudents[index];

    document.getElementById('billCounter').textContent = `${index + 1} / ${billStudents.length}`;
    document.getElementById('billName').textContent = s.name;
    document.getElementById('billGrade').textContent = s.grade;
    document.getElementById('billSchool').textContent = s.school;
    document.getElementById('billTotal').textContent = s.total.toLocaleString();

    let notes = [];
    s.items.forEach(item => {
        if (item.note) {
            notes.push(`【${item.name}】\n${item.note}`);
        }
    });
    document.getElementById('billNote').innerText = notes.join("\n\n");

    const tbody = document.getElementById('itemsTable');
    tbody.innerHTML = "";

    s.items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
                    <td class="col-1" contenteditable="true">${item.name}</td>
                    <td class="col-2" contenteditable="true">${item.dateHtml}</td>
                    <td class="col-3" contenteditable="true">$${item.price.toLocaleString()}</td>
                `;
        tbody.appendChild(tr);
    });

    for (let i = s.items.length; i < 6; i++) {
        const tr = document.createElement('tr');
        if (i === s.items.length) {
            tr.innerHTML = '<td class="col-1" style="color:black; font-weight:bold;">　【 以 下 空 白 】</td><td colspan="2"></td>';
        } else {
            tr.innerHTML = '<td colspan="3">&nbsp;</td>';
        }
        tbody.appendChild(tr);
    }
};

window.createManualBill = function () {
    const emptyStudent = {
        name: "姓名",
        grade: "",
        school: "",
        total: 0,
        items: [{ name: "科目名稱", dateHtml: "日期", price: 0 }]
    };
    billStudents.push(emptyStudent);
    loadBill(billStudents.length - 1);
};

window.downloadCurrentBill = function () {
    const element = document.getElementById('billArea');
    const name = document.getElementById('billName').textContent || "學費單";
    html2canvas(element, { scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `${name}_學費單.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
};

window.downloadAllBills = async function () {
    if (!confirm(`確定要下載全部 ${billStudents.length} 張學費單嗎？`)) return;

    for (let i = 0; i < billStudents.length; i++) {
        loadBill(i);
        await new Promise(r => setTimeout(r, 500));
        const element = document.getElementById('billArea');
        const name = billStudents[i].name;

        await html2canvas(element, { scale: 2 }).then(canvas => {
            const link = document.createElement('a');
            link.download = `${name}_學費單.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        });
    }
    alert("✅ 全部下載完成！");
};

window.initPrintPage = function () {
    updatePrintCourseList();
};

window.updatePrintCourseList = function () {
    const source = document.getElementById('printSourceSelector').value;
    const selector = document.getElementById('printCourseSelector');
    const saveArea = document.getElementById('manualSaveArea');

    selector.innerHTML = '<option value="">請選擇...</option>';
    saveArea.style.display = 'none';

    if (source === 'live') {
        saveArea.style.display = 'flex';
        Object.keys(coursesData).forEach(key => {
            const c = coursesData[key];
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `[Live] ${c.grade} ${c.subject} ${c.classType || ''}`;
            selector.appendChild(option);
        });
    } else if (source === 'manual') {
        saveArea.style.display = 'flex';
        Object.keys(printLayouts).forEach(key => {
            const layout = printLayouts[key];
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `[Saved] ${layout.name}`;
            selector.appendChild(option);
        });
    } else if (source === 'empty') {
        saveArea.style.display = 'flex';
        Object.keys(classrooms).forEach(key => {
            const c = classrooms[key];
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `[Empty] ${c.name}`;
            selector.appendChild(option);
        });
    }
};

window.generateSeatingChart = function () {
    const source = document.getElementById('printSourceSelector').value;
    const selectedId = document.getElementById('printCourseSelector').value;
    const grid = document.getElementById('printGrid');
    grid.innerHTML = "";

    if (!selectedId) return;

    let layoutToRender = null;
    let currentSeats = {};
    let classroomName = "";
    let classType = "";
    let time = "";
    let teacher = "";

    if (source === 'live') {
        const c = coursesData[selectedId];
        if (!c) return;

        classroomName = classrooms[c.classroom] ? classrooms[c.classroom].name : c.classroom;
        classType = `班級：${c.subject} ${c.classType || ''}`;
        time = `上課時間：${c.timeDescription || '-'}`;
        teacher = `老師：${c.teacher}`;

        layoutToRender = c.layout || (classrooms[c.classroom] ? classrooms[c.classroom].layout : null);
        currentSeats = seatsData[selectedId] || {};

    } else if (source === 'manual') {
        const saved = printLayouts[selectedId];
        if (!saved) return;

        classroomName = saved.classroomName;
        classType = `班級：${saved.name}`;
        time = `上課時間：${saved.time || ''}`;
        teacher = `老師：${saved.teacher || ''}`;

        layoutToRender = saved.layout;

    } else if (source === 'empty') {
        const c = classrooms[selectedId];
        if (!c) return;

        classroomName = c.name;
        classType = "班級：(請點擊輸入)";
        time = "上課時間：";
        teacher = "老師：";
        layoutToRender = c.layout;
        currentSeats = {};
    }

    if (!layoutToRender) return;

    document.getElementById('p_classroom').textContent = classroomName;
    document.getElementById('p_classType').textContent = classType;
    document.getElementById('p_time').textContent = time;
    document.getElementById('p_teacher').textContent = teacher;

    document.getElementById('p_classType').contentEditable = true;
    document.getElementById('p_time').contentEditable = true;
    document.getElementById('p_teacher').contentEditable = true;

    layoutToRender.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'print-row';
        row.forEach(seatCode => {
            const seat = document.createElement('div');
            seat.className = 'print-seat';

            let code = seatCode;
            let isBlocked = false;

            if (code.includes(':X')) { code = code.split(':')[0]; isBlocked = true; }

            if (code === "_") {
                seat.classList.add('aisle');
            } else if (code === "DOOR") {
                seat.classList.add('door');
                seat.textContent = "門";
            } else if (code === "PILLAR") {
                seat.classList.add('pillar');
                seat.textContent = "柱";
            } else {
                if (isBlocked) {
                    seat.classList.add('blocked');
                    seat.textContent = code;
                } else {
                    seat.dataset.id = code;
                    seat.contentEditable = true;

                    if (source === 'live') {
                        const info = currentSeats[code];
                        if (info && info.status === 'sold') {
                            seat.textContent = info.studentName;
                            if (info.studentName.length > 3) seat.style.fontSize = "14px";
                        }
                    } else if (source === 'manual') {
                        const saved = printLayouts[selectedId];
                        if (saved.seatMap && saved.seatMap[code]) {
                            seat.textContent = saved.seatMap[code];
                            if (saved.seatMap[code].length > 3) seat.style.fontSize = "14px";
                        }
                    }
                }
            }
            rowDiv.appendChild(seat);
        });
        grid.appendChild(rowDiv);
    });

    setTimeout(() => {
        const container = document.querySelector('.print-container');
        const gridEl = document.getElementById('printGrid');

        gridEl.style.transform = 'none';

        const availableWidth = container.clientWidth - 40;
        const gridWidth = gridEl.scrollWidth;

        if (gridWidth > availableWidth && availableWidth > 0) {
            const scale = availableWidth / gridWidth;
            gridEl.style.transform = `scale(${scale})`;
        }
    }, 100);
};

window.saveManualLayout = function () {
    const saveName = document.getElementById('manualSaveName').value.trim();
    if (!saveName) return alert("請輸入存檔名稱！");

    let existingKey = null;
    for (let key in printLayouts) {
        if (printLayouts[key].name === saveName) {
            existingKey = key;
            break;
        }
    }

    if (existingKey) {
        if (!confirm(`⚠️ 檔名「${saveName}」已存在，是否要覆蓋原本的存檔？`)) {
            return;
        }
    }

    const source = document.getElementById('printSourceSelector').value;
    const selectedId = document.getElementById('printCourseSelector').value;

    const seatMap = {};
    document.querySelectorAll('.print-seat[data-id]').forEach(seat => {
        const text = seat.textContent.trim();
        if (text) {
            seatMap[seat.dataset.id] = text;
        }
    });

    const classType = document.getElementById('p_classType').textContent;
    const time = document.getElementById('p_time').textContent;
    const teacher = document.getElementById('p_teacher').textContent;
    const classroomName = document.getElementById('p_classroom').textContent;

    let baseLayout = [];
    if (source === 'live') {
        const c = coursesData[selectedId];
        baseLayout = c.layout || classrooms[c.classroom].layout;
    } else if (source === 'empty') {
        baseLayout = classrooms[selectedId].layout;
    } else if (source === 'manual') {
        baseLayout = printLayouts[selectedId].layout;
    }

    const saveId = existingKey ? existingKey : "LAYOUT_" + Date.now();
    const saveData = {
        name: saveName,
        classroomName: classroomName,
        classType: classType,
        time: time,
        teacher: teacher,
        layout: baseLayout,
        seatMap: seatMap,
        updatedAt: Date.now()
    };

    update(ref(db, `print_layouts/${saveId}`), saveData).then(() => {
        alert("✅ 已另存新檔！您可以在「手動排位存檔」中找到它。");
        document.getElementById('printSourceSelector').value = 'manual';
        updatePrintCourseList();
    }).catch(err => alert("存檔失敗：" + err.message));
};

window.downloadSeatingChart = function () {
    const element = document.querySelector('.print-container');
    const title = document.getElementById('p_classType').textContent.replace('班級：', '').trim() || "座位表";
    const filename = `${title}_座位表.png`;

    html2canvas(element, { scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });
};

// ★★★ V36.0 雲端圖庫邏輯 (共用模組) ★★★
let bannerGalleryData = {};
let coverGalleryData = {};
let currentGalleryType = 'banner';

onValue(ref(db, 'banner_gallery'), (snapshot) => {
    bannerGalleryData = snapshot.val() || {};
    if (document.getElementById('galleryModal').style.display === 'flex' && currentGalleryType === 'banner') {
        renderGalleryGrid();
    }
});

onValue(ref(db, 'cover_gallery'), (snapshot) => {
    coverGalleryData = snapshot.val() || {};
    if (document.getElementById('galleryModal').style.display === 'flex' && currentGalleryType === 'cover') {
        renderGalleryGrid();
    }
});

window.openBannerGalleryModal = function () {
    currentGalleryType = 'banner';
    document.getElementById('galleryModalTitle').textContent = "☁️ 雲端橫幅圖庫";
    document.getElementById('galleryModalDesc').textContent = "點擊圖片即可將其設為首頁輪播圖！";
    document.getElementById('galleryModal').style.display = 'flex';
    renderGalleryGrid();
};

window.openCoverGalleryModal = function () {
    currentGalleryType = 'cover';
    document.getElementById('galleryModalTitle').textContent = "🖼️ 雲端課程封面圖庫";
    document.getElementById('galleryModalDesc').textContent = "點擊圖片即可將其設為本課程封面！";
    document.getElementById('galleryModal').style.display = 'flex';
    renderGalleryGrid();
};

window.closeGalleryModal = function () {
    document.getElementById('galleryModal').style.display = 'none';
};

window.renderGalleryGrid = function () {
    const grid = document.getElementById('galleryGrid');
    grid.innerHTML = "";

    const dataSource = currentGalleryType === 'banner' ? bannerGalleryData : coverGalleryData;
    const keys = Object.keys(dataSource).sort((a, b) => dataSource[b].createdAt - dataSource[a].createdAt);

    if (keys.length === 0) {
        grid.innerHTML = "<div style='grid-column: 1 / -1; text-align: center; color: #999; padding: 20px;'>雲端圖庫目前是空的。</div>";
        return;
    }

    keys.forEach(key => {
        const item = dataSource[key];
        const date = new Date(item.createdAt).toLocaleDateString();
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.innerHTML = `
                    <button class="btn-gallery-del" onclick="deleteGalleryItem('${key}', event)" title="從圖庫永久刪除">✕</button>
                    <img src="${item.url}" class="gallery-img" onclick="selectFromGallery('${item.url}', '${item.name}')" title="點擊套用">
                    <div class="gallery-info" title="${item.name}">${item.name}<br><span style="font-size:10px;color:#999;">${date}</span></div>
                `;
        grid.appendChild(div);
    });
};

window.selectFromGallery = async function (url, name) {
    if (currentGalleryType === 'banner') {
        if (confirm(`確定要將「${name}」加入首頁輪播圖嗎？`)) {
            try {
                await push(ref(db, 'banners'), { url: url, createdAt: Date.now(), source: 'gallery' });
                alert("✅ 成功加入首頁輪播圖！");
                closeGalleryModal();
            } catch (err) {
                alert("加入失敗：" + err.message);
            }
        }
    } else if (currentGalleryType === 'cover') {
        document.getElementById('c_image_url').value = url;
        window.previewImage(url);
        closeGalleryModal();
    }
};

window.deleteGalleryItem = async function (key, event) {
    event.stopPropagation();
    const targetNode = currentGalleryType === 'banner' ? 'banner_gallery' : 'cover_gallery';

    if (confirm("⚠️ 確定要從雲端圖庫中永久刪除這張圖片嗎？")) {
        try {
            await remove(ref(db, `${targetNode}/${key}`));
        } catch (err) {
            alert("刪除失敗：" + err.message);
        }
    }
};

// ★★★ V36.1 封面圖庫批次上傳邏輯 ★★★
window.uploadMultipleCovers = async function (input) {
    const files = input.files;
    if (files.length === 0) return;

    const statusEl = document.getElementById('uploadStatus');
    statusEl.style.color = "#3498db";

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        statusEl.textContent = `🚀 正在上傳第 ${i + 1} / ${files.length} 張圖片：${file.name}...`;

        try {
            const storagePath = `cover_gallery/${Date.now()}_${file.name}`;
            const imgRef = storageRef(storage, storagePath);
            await uploadBytes(imgRef, file, { contentType: file.type });
            const url = await getDownloadURL(imgRef);

            await push(ref(db, 'cover_gallery'), {
                name: file.name.split('.')[0],
                url: url,
                createdAt: Date.now()
            });
        } catch (err) {
            console.error(`上傳 ${file.name} 失敗:`, err);
            alert(`❌ 圖片 ${file.name} 上傳失敗！請檢查密碼或網路。`);
            input.value = "";
            statusEl.textContent = "";
            return;
        }
    }

    statusEl.style.color = "#27ae60";
    statusEl.textContent = `✅ 批次上傳完成！共存入 ${files.length} 張封面。`;
    input.value = "";

    setTimeout(() => { statusEl.textContent = ""; }, 3000);
};