const APP_CONFIG = {
  APP_NAME: 'LMS Self-Compassion',
  SPREADSHEET_ID: '1bhlFA70L1C26vinWa4c9nblbBcyQpOmPzlwXuuDWBko', // Isi jika project Apps Script tidak dibuat langsung dari Google Sheet.
  OTP_EXPIRED_MINUTES: 10,
  EMAIL_SENDER_NAME: 'LMS Self-Compassion',
  SHEETS: {
    USERS: 'USERS',
    MODULES: 'MODULES',
    LESSONS: 'LESSONS',
    EXERCISES: 'EXERCISES',
    JOURNALS: 'JOURNALS',
    USER_PROGRESS: 'USER_PROGRESS',
    REMINDERS: 'REMINDERS'
  }
};

const USER_HEADERS = [
  'ID_USER',
  'KODE_RESPONDEN',
  'NAMA',
  'EMAIL',
  'PASSWORD_HASH',
  'KELAS',
  'SEKOLAH',
  'ROLE',
  'STATUS_AKUN',
  'STATUS_VERIFIKASI_EMAIL',
  'KODE_OTP',
  'EXPIRED_OTP',
  'CREATED_AT',
  'UPDATED_AT',
  'LAST_LOGIN'
];

const USER_COL = {
  ID_USER: 1,
  KODE_RESPONDEN: 2,
  NAMA: 3,
  EMAIL: 4,
  PASSWORD_HASH: 5,
  KELAS: 6,
  SEKOLAH: 7,
  ROLE: 8,
  STATUS_AKUN: 9,
  STATUS_VERIFIKASI_EMAIL: 10,
  KODE_OTP: 11,
  EXPIRED_OTP: 12,
  CREATED_AT: 13,
  UPDATED_AT: 14,
  LAST_LOGIN: 15
};

const MODULE_HEADERS = [
  'MODULE_ID',
  'URUTAN',
  'JUDUL',
  'DESKRIPSI',
  'TIPE',
  'STATUS',
  'CREATED_AT',
  'UPDATED_AT'
];

const LESSON_HEADERS = [
  'LESSON_ID',
  'MODULE_ID',
  'URUTAN',
  'JUDUL',
  'TIPE_KONTEN',
  'KONTEN',
  'VIDEO_URL',
  'DURASI_MENIT',
  'STATUS',
  'CREATED_AT',
  'UPDATED_AT'
];

const EXERCISE_HEADERS = [
  'EXERCISE_ID',
  'MODULE_ID',
  'LESSON_ID',
  'TIPE_EXERCISE',
  'PERTANYAAN',
  'PANDUAN',
  'STATUS',
  'CREATED_AT',
  'UPDATED_AT'
];

const JOURNAL_HEADERS = [
  'JOURNAL_ID',
  'ID_USER',
  'KODE_RESPONDEN',
  'MODULE_ID',
  'LESSON_ID',
  'EXERCISE_ID',
  'TIPE_JURNAL',
  'PERTANYAAN',
  'JAWABAN',
  'MOOD',
  'CREATED_AT'
];

const USER_PROGRESS_HEADERS = [
  'PROGRESS_ID',
  'ID_USER',
  'KODE_RESPONDEN',
  'MODULE_ID',
  'LESSON_ID',
  'STATUS_PROGRESS',
  'PERSENTASE',
  'STARTED_AT',
  'COMPLETED_AT',
  'UPDATED_AT'
];

const REMINDER_HEADERS = [
  'REMINDER_ID',
  'ID_USER',
  'KODE_RESPONDEN',
  'JUDUL',
  'PESAN',
  'TIPE',
  'STATUS',
  'CREATED_AT',
  'UPDATED_AT'
];

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_CONFIG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getSpreadsheet_() {
  if (APP_CONFIG.SPREADSHEET_ID && APP_CONFIG.SPREADSHEET_ID.trim() !== '') {
    return SpreadsheetApp.openById(APP_CONFIG.SPREADSHEET_ID.trim());
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error('Spreadsheet database tidak ditemukan. Jika project Apps Script dibuat standalone, isi APP_CONFIG.SPREADSHEET_ID di Code.gs.');
  }

  return ss;
}

function getSheetByName_(sheetName) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    setupDatabase();
    sheet = ss.getSheetByName(sheetName);
  }

  if (!sheet) {
    throw new Error('Sheet ' + sheetName + ' tidak ditemukan.');
  }

  return sheet;
}

function getUserSheet_() {
  return getSheetByName_(APP_CONFIG.SHEETS.USERS);
}

function getAllRowsAsObjects_(sheetName, headers) {
  const sheet = getSheetByName_(sheetName);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  return values.map(function(row, index) {
    const obj = {
      rowNumber: index + 2
    };

    headers.forEach(function(header, i) {
      obj[header] = row[i];
    });

    return obj;
  });
}

function generateId_(prefix) {
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyyMMddHHmmss'
  );

  const random = Math.floor(1000 + Math.random() * 9000);

  return prefix + '-' + timestamp + '-' + random;
}

function registerUser(data) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);

    const sheet = getUserSheet_();

    const nama = String(data.nama || '').trim();
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    const kelas = String(data.kelas || 'XI').trim();
    const sekolah = String(data.sekolah || '').trim();

    if (!nama || !email || !password) {
      return {
        success: false,
        message: 'Nama, email, dan password wajib diisi.'
      };
    }

    if (!isValidEmail_(email)) {
      return {
        success: false,
        message: 'Format email belum valid.'
      };
    }

    if (password.length < 6) {
      return {
        success: false,
        message: 'Password minimal 6 karakter.'
      };
    }

    const existingUser = findUserByEmail_(email);

    if (existingUser && existingUser.statusVerifikasiEmail === 'VERIFIED') {
      return {
        success: false,
        message: 'Email ini sudah terdaftar dan sudah terverifikasi. Silakan masuk menggunakan akun tersebut.'
      };
    }

    const now = new Date();
    const otp = generateOtp_();
    const expiredAt = new Date(now.getTime() + APP_CONFIG.OTP_EXPIRED_MINUTES * 60 * 1000);
    const passwordHash = hashPassword_(password, email);

    if (existingUser && existingUser.statusVerifikasiEmail !== 'VERIFIED') {
      sheet.getRange(existingUser.rowNumber, USER_COL.NAMA).setValue(nama);
      sheet.getRange(existingUser.rowNumber, USER_COL.PASSWORD_HASH).setValue(passwordHash);
      sheet.getRange(existingUser.rowNumber, USER_COL.KELAS).setValue(kelas);
      sheet.getRange(existingUser.rowNumber, USER_COL.SEKOLAH).setValue(sekolah);
      sheet.getRange(existingUser.rowNumber, USER_COL.STATUS_AKUN).setValue('PENDING');
      sheet.getRange(existingUser.rowNumber, USER_COL.STATUS_VERIFIKASI_EMAIL).setValue('PENDING');
      sheet.getRange(existingUser.rowNumber, USER_COL.KODE_OTP).setValue(otp);
      sheet.getRange(existingUser.rowNumber, USER_COL.EXPIRED_OTP).setValue(expiredAt);
      sheet.getRange(existingUser.rowNumber, USER_COL.UPDATED_AT).setValue(now);

      SpreadsheetApp.flush();
      sendOtpEmail_(email, nama, otp);

      return {
        success: true,
        requiresVerification: true,
        email: email,
        message: 'Kode OTP baru sudah dikirim ke email kamu. Silakan cek inbox atau spam.'
      };
    }

    const idUser = generateUserId_();
    const kodeResponden = generateKodeResponden_();

    sheet.appendRow([
      idUser,
      kodeResponden,
      nama,
      email,
      passwordHash,
      kelas,
      sekolah,
      'SISWA',
      'PENDING',
      'PENDING',
      otp,
      expiredAt,
      now,
      now,
      ''
    ]);

    SpreadsheetApp.flush();
    sendOtpEmail_(email, nama, otp);

    return {
      success: true,
      requiresVerification: true,
      email: email,
      message: 'Pendaftaran berhasil. Kode OTP sudah dikirim ke email kamu. Silakan cek inbox atau spam.'
    };

  } catch (error) {
    return {
      success: false,
      message: 'Terjadi kesalahan saat daftar: ' + error.message
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

function verifyOtp(data) {
  try {
    const email = String(data.email || '').trim().toLowerCase();
    const otp = String(data.otp || '').trim();

    if (!email || !otp) {
      return {
        success: false,
        message: 'Email dan kode OTP wajib diisi.'
      };
    }

    const user = findUserByEmail_(email);

    if (!user) {
      return {
        success: false,
        message: 'Akun tidak ditemukan. Silakan daftar terlebih dahulu.'
      };
    }

    if (user.statusVerifikasiEmail === 'VERIFIED' && user.statusAkun === 'ACTIVE') {
      return {
        success: true,
        message: 'Email sudah terverifikasi. Silakan masuk.'
      };
    }

    const savedOtp = String(user.kodeOtp || '').trim();
    const expiredAt = user.expiredOtp instanceof Date
      ? user.expiredOtp
      : new Date(user.expiredOtp);

    if (!savedOtp) {
      return {
        success: false,
        message: 'Kode OTP tidak ditemukan. Silakan kirim ulang OTP.'
      };
    }

    if (new Date() > expiredAt) {
      return {
        success: false,
        expired: true,
        message: 'Kode OTP sudah kedaluwarsa. Silakan kirim ulang OTP.'
      };
    }

    if (otp !== savedOtp) {
      return {
        success: false,
        message: 'Kode OTP salah. Silakan cek kembali email kamu.'
      };
    }

    const sheet = getUserSheet_();
    const now = new Date();

    sheet.getRange(user.rowNumber, USER_COL.STATUS_AKUN).setValue('ACTIVE');
    sheet.getRange(user.rowNumber, USER_COL.STATUS_VERIFIKASI_EMAIL).setValue('VERIFIED');
    sheet.getRange(user.rowNumber, USER_COL.KODE_OTP).setValue('');
    sheet.getRange(user.rowNumber, USER_COL.EXPIRED_OTP).setValue('');
    sheet.getRange(user.rowNumber, USER_COL.UPDATED_AT).setValue(now);

    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'Verifikasi email berhasil. Silakan masuk menggunakan email dan password kamu.'
    };

  } catch (error) {
    return {
      success: false,
      message: 'Terjadi kesalahan saat verifikasi OTP: ' + error.message
    };
  }
}

function resendOtp(data) {
  try {
    const email = String(data.email || '').trim().toLowerCase();

    if (!email) {
      return {
        success: false,
        message: 'Email wajib diisi.'
      };
    }

    const user = findUserByEmail_(email);

    if (!user) {
      return {
        success: false,
        message: 'Akun tidak ditemukan. Silakan daftar terlebih dahulu.'
      };
    }

    if (user.statusVerifikasiEmail === 'VERIFIED' && user.statusAkun === 'ACTIVE') {
      return {
        success: false,
        message: 'Email sudah terverifikasi. Silakan masuk.'
      };
    }

    const sheet = getUserSheet_();
    const now = new Date();
    const otp = generateOtp_();
    const expiredAt = new Date(now.getTime() + APP_CONFIG.OTP_EXPIRED_MINUTES * 60 * 1000);

    sheet.getRange(user.rowNumber, USER_COL.STATUS_AKUN).setValue('PENDING');
    sheet.getRange(user.rowNumber, USER_COL.STATUS_VERIFIKASI_EMAIL).setValue('PENDING');
    sheet.getRange(user.rowNumber, USER_COL.KODE_OTP).setValue(otp);
    sheet.getRange(user.rowNumber, USER_COL.EXPIRED_OTP).setValue(expiredAt);
    sheet.getRange(user.rowNumber, USER_COL.UPDATED_AT).setValue(now);

    SpreadsheetApp.flush();
    sendOtpEmail_(email, user.nama, otp);

    return {
      success: true,
      message: 'Kode OTP baru sudah dikirim ke email kamu. Silakan cek inbox atau spam.'
    };

  } catch (error) {
    return {
      success: false,
      message: 'Terjadi kesalahan saat mengirim ulang OTP: ' + error.message
    };
  }
}

function loginUser(data) {
  try {
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');

    if (!email || !password) {
      return {
        success: false,
        message: 'Email dan password wajib diisi.'
      };
    }

    const user = findUserByEmail_(email);

    if (!user) {
      return {
        success: false,
        message: 'Akun tidak ditemukan. Silakan daftar terlebih dahulu.'
      };
    }

    const passwordHash = hashPassword_(password, email);

    if (passwordHash !== user.passwordHash) {
      return {
        success: false,
        message: 'Password salah. Silakan coba lagi.'
      };
    }

    if (user.statusVerifikasiEmail !== 'VERIFIED' || user.statusAkun !== 'ACTIVE') {
      return {
        success: false,
        requiresVerification: true,
        email: email,
        message: 'Akun belum diverifikasi. Silakan masukkan kode OTP yang dikirim ke email kamu.'
      };
    }

    updateLastLogin_(user.rowNumber);

    return {
      success: true,
      message: 'Login berhasil.',
      user: {
        idUser: user.idUser,
        kodeResponden: user.kodeResponden,
        nama: user.nama,
        email: user.email,
        kelas: user.kelas,
        sekolah: user.sekolah,
        role: user.role
      }
    };

  } catch (error) {
    return {
      success: false,
      message: 'Terjadi kesalahan saat masuk: ' + error.message
    };
  }
}

function findUserByEmail_(email) {
  const sheet = getUserSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, USER_HEADERS.length).getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const rowEmail = String(row[USER_COL.EMAIL - 1] || '').trim().toLowerCase();

    if (rowEmail === email) {
      return {
        rowNumber: i + 2,
        idUser: row[USER_COL.ID_USER - 1],
        kodeResponden: row[USER_COL.KODE_RESPONDEN - 1],
        nama: row[USER_COL.NAMA - 1],
        email: row[USER_COL.EMAIL - 1],
        passwordHash: row[USER_COL.PASSWORD_HASH - 1],
        kelas: row[USER_COL.KELAS - 1],
        sekolah: row[USER_COL.SEKOLAH - 1],
        role: row[USER_COL.ROLE - 1],
        statusAkun: row[USER_COL.STATUS_AKUN - 1],
        statusVerifikasiEmail: row[USER_COL.STATUS_VERIFIKASI_EMAIL - 1],
        kodeOtp: row[USER_COL.KODE_OTP - 1],
        expiredOtp: row[USER_COL.EXPIRED_OTP - 1]
      };
    }
  }

  return null;
}


function findUserById_(idUser) {
  const sheet = getUserSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, USER_HEADERS.length).getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const rowIdUser = String(row[USER_COL.ID_USER - 1] || '').trim();

    if (rowIdUser === String(idUser || '').trim()) {
      return {
        rowNumber: i + 2,
        idUser: row[USER_COL.ID_USER - 1],
        kodeResponden: row[USER_COL.KODE_RESPONDEN - 1],
        nama: row[USER_COL.NAMA - 1],
        email: row[USER_COL.EMAIL - 1],
        passwordHash: row[USER_COL.PASSWORD_HASH - 1],
        kelas: row[USER_COL.KELAS - 1],
        sekolah: row[USER_COL.SEKOLAH - 1],
        role: row[USER_COL.ROLE - 1],
        statusAkun: row[USER_COL.STATUS_AKUN - 1],
        statusVerifikasiEmail: row[USER_COL.STATUS_VERIFIKASI_EMAIL - 1],
        kodeOtp: row[USER_COL.KODE_OTP - 1],
        expiredOtp: row[USER_COL.EXPIRED_OTP - 1]
      };
    }
  }

  return null;
}

function validateActiveUser_(userPayload) {
  const idUser = String((userPayload && userPayload.idUser) || '').trim();
  const kodeResponden = String((userPayload && userPayload.kodeResponden) || '').trim();
  const email = String((userPayload && userPayload.email) || '').trim().toLowerCase();

  if (!idUser || !kodeResponden || !email) {
    throw new Error('Sesi user tidak valid. Silakan login ulang.');
  }

  const user = findUserById_(idUser);

  if (!user) {
    throw new Error('Akun tidak ditemukan. Silakan login ulang.');
  }

  if (
    String(user.kodeResponden || '').trim() !== kodeResponden ||
    String(user.email || '').trim().toLowerCase() !== email
  ) {
    throw new Error('Sesi user tidak sesuai dengan database. Silakan login ulang.');
  }

  if (String(user.statusAkun || '').trim().toUpperCase() !== 'ACTIVE') {
    throw new Error('Akun belum aktif.');
  }

  if (String(user.statusVerifikasiEmail || '').trim().toUpperCase() !== 'VERIFIED') {
    throw new Error('Email akun belum terverifikasi.');
  }

  return user;
}


function updateLastLogin_(rowNumber) {
  const sheet = getUserSheet_();
  const now = new Date();

  sheet.getRange(rowNumber, USER_COL.UPDATED_AT).setValue(now);
  sheet.getRange(rowNumber, USER_COL.LAST_LOGIN).setValue(now);

  SpreadsheetApp.flush();
}


function getStudentDashboardByEmail(email) {
  try {
    ensureLmsSeedData_();

    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return {
        success: false,
        message: 'Email siswa tidak valid. Silakan login ulang.'
      };
    }

    const user = findUserByEmail_(cleanEmail);

    if (!user) {
      return {
        success: false,
        message: 'Akun siswa tidak ditemukan di sheet USERS. Silakan login ulang.'
      };
    }

    return getStudentDashboardData({
      idUser: user.idUser,
      kodeResponden: user.kodeResponden,
      email: user.email
    });

  } catch (error) {
    return {
      success: false,
      message: 'Gagal mengambil dashboard siswa berdasarkan email: ' + error.message
    };
  }
}


function getStudentDashboardData(userPayload) {
  try {
    ensureLmsSeedData_();

    const activeUser = validateActiveUser_(userPayload);
    const idUser = String(activeUser.idUser || '').trim();
    const kodeResponden = String(activeUser.kodeResponden || '').trim();

    let modules = getAllRowsAsObjects_(APP_CONFIG.SHEETS.MODULES, MODULE_HEADERS)
      .filter(function(item) {
        const status = String(item.STATUS || '').trim().toUpperCase();
        return status === '' || status === 'ACTIVE';
      })
      .sort(function(a, b) {
        return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
      });

    const lessons = getAllRowsAsObjects_(APP_CONFIG.SHEETS.LESSONS, LESSON_HEADERS)
      .filter(function(item) {
        const status = String(item.STATUS || '').trim().toUpperCase();
        return status === '' || status === 'ACTIVE';
      })
      .sort(function(a, b) {
        const modCompare = String(a.MODULE_ID || '').localeCompare(String(b.MODULE_ID || ''));
        if (modCompare !== 0) return modCompare;
        return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
      });

    if (modules.length === 0 && lessons.length > 0) {
      const moduleMap = {};
      lessons.forEach(function(lesson) {
        const moduleId = String(lesson.MODULE_ID || '').trim();
        if (!moduleId) return;

        if (!moduleMap[moduleId]) {
          moduleMap[moduleId] = {
            MODULE_ID: moduleId,
            URUTAN: Object.keys(moduleMap).length + 1,
            JUDUL: 'Modul ' + moduleId.replace('MOD-', ''),
            DESKRIPSI: 'Materi pembelajaran self-compassion.',
            TIPE: 'MODUL',
            STATUS: 'ACTIVE'
          };
        }
      });

      modules = Object.keys(moduleMap).map(function(key) {
        return moduleMap[key];
      });
    }

    const progressRows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.USER_PROGRESS, USER_PROGRESS_HEADERS)
      .filter(function(item) {
        return String(item.ID_USER || '') === idUser &&
          String(item.KODE_RESPONDEN || '') === kodeResponden;
      });

    const journalRows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.JOURNALS, JOURNAL_HEADERS)
      .filter(function(item) {
        return String(item.ID_USER || '') === idUser &&
          String(item.KODE_RESPONDEN || '') === kodeResponden;
      });

    const reminderRows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.REMINDERS, REMINDER_HEADERS)
      .filter(function(item) {
        return String(item.ID_USER || '') === idUser &&
          String(item.KODE_RESPONDEN || '') === kodeResponden &&
          String(item.STATUS || '').trim().toUpperCase() === 'ACTIVE';
      });

    const completedLessonKeys = {};
    progressRows.forEach(function(row) {
      if (String(row.STATUS_PROGRESS || '').trim().toUpperCase() === 'COMPLETED') {
        completedLessonKeys[String(row.LESSON_ID)] = true;
      }
    });

    const moduleData = modules.map(function(module) {
      const moduleLessons = lessons
        .filter(function(lesson) {
          return String(lesson.MODULE_ID || '').trim() === String(module.MODULE_ID || '').trim();
        })
        .sort(function(a, b) {
          return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
        });

      const totalLessons = moduleLessons.length;
      const completedLessons = moduleLessons.filter(function(lesson) {
        return completedLessonKeys[String(lesson.LESSON_ID)] === true;
      }).length;

      const percentage = totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

      let status = 'TERKUNCI';

      if (Number(module.URUTAN) === 1 || percentage > 0 || isPreviousModuleCompleted_(modules, lessons, completedLessonKeys, module)) {
        status = percentage >= 100 && totalLessons > 0 ? 'SELESAI' : 'BERJALAN';
      }

      return {
        moduleId: module.MODULE_ID,
        urutan: module.URUTAN,
        judul: module.JUDUL,
        deskripsi: module.DESKRIPSI,
        tipe: module.TIPE,
        totalLessons: totalLessons,
        completedLessons: completedLessons,
        percentage: percentage,
        status: status,
        lessons: moduleLessons.map(function(lesson) {
          return {
            lessonId: lesson.LESSON_ID,
            moduleId: lesson.MODULE_ID,
            urutan: lesson.URUTAN,
            judul: lesson.JUDUL,
            tipeKonten: lesson.TIPE_KONTEN,
            konten: lesson.KONTEN,
            videoUrl: lesson.VIDEO_URL,
            durasiMenit: lesson.DURASI_MENIT,
            completed: completedLessonKeys[String(lesson.LESSON_ID)] === true
          };
        })
      };
    });

    const totalModules = moduleData.length;
    const completedModules = moduleData.filter(function(module) {
      return module.status === 'SELESAI';
    }).length;

    const totalLessons = lessons.length;
    const completedLessons = Object.keys(completedLessonKeys).length;

    const overallProgress = totalLessons > 0
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;

    return {
      success: true,
      user: {
        idUser: activeUser.idUser,
        kodeResponden: activeUser.kodeResponden,
        nama: activeUser.nama,
        email: activeUser.email,
        kelas: activeUser.kelas,
        sekolah: activeUser.sekolah,
        role: activeUser.role
      },
      modules: moduleData,
      stats: {
        totalModules: totalModules,
        completedModules: completedModules,
        totalLessons: totalLessons,
        completedLessons: completedLessons,
        totalJournals: journalRows.length,
        overallProgress: overallProgress
      },
      reminders: reminderRows.map(function(row) {
        return {
          reminderId: row.REMINDER_ID,
          title: row.JUDUL,
          message: row.PESAN,
          type: row.TIPE,
          createdAt: row.CREATED_AT
        };
      }),
      recentJournals: journalRows.slice(-5).reverse().map(function(row) {
        return {
          pertanyaan: row.PERTANYAAN,
          jawaban: row.JAWABAN,
          mood: row.MOOD,
          createdAt: row.CREATED_AT
        };
      })
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal mengambil data personal siswa: ' + error.message
    };
  }
}

function isPreviousModuleCompleted_(modules, lessons, completedLessonKeys, currentModule) {
  const currentOrder = Number(currentModule.URUTAN || 0);

  if (currentOrder <= 1) {
    return true;
  }

  const previousModule = modules.find(function(module) {
    return Number(module.URUTAN || 0) === currentOrder - 1;
  });

  if (!previousModule) {
    return false;
  }

  const previousLessons = lessons.filter(function(lesson) {
    return String(lesson.MODULE_ID) === String(previousModule.MODULE_ID);
  });

  if (previousLessons.length === 0) {
    return true;
  }

  return previousLessons.every(function(lesson) {
    return completedLessonKeys[String(lesson.LESSON_ID)] === true;
  });
}

function markLessonCompleted(data) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);

    const activeUser = validateActiveUser_(data.user || {});
    const idUser = String(activeUser.idUser || '').trim();
    const kodeResponden = String(activeUser.kodeResponden || '').trim();
    const moduleId = String(data.moduleId || '').trim();
    const lessonId = String(data.lessonId || '').trim();

    if (!idUser || !kodeResponden || !moduleId || !lessonId) {
      return {
        success: false,
        message: 'Data progress belum lengkap.'
      };
    }

    const sheet = getSheetByName_(APP_CONFIG.SHEETS.USER_PROGRESS);
    const rows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.USER_PROGRESS, USER_PROGRESS_HEADERS);

    const existing = rows.find(function(row) {
      return String(row.ID_USER) === idUser &&
        String(row.MODULE_ID) === moduleId &&
        String(row.LESSON_ID) === lessonId;
    });

    const now = new Date();

    if (existing) {
      sheet.getRange(existing.rowNumber, 6).setValue('COMPLETED');
      sheet.getRange(existing.rowNumber, 7).setValue(100);
      sheet.getRange(existing.rowNumber, 9).setValue(now);
      sheet.getRange(existing.rowNumber, 10).setValue(now);
    } else {
      sheet.appendRow([
        generateId_('PROG'),
        idUser,
        kodeResponden,
        moduleId,
        lessonId,
        'COMPLETED',
        100,
        now,
        now,
        now
      ]);
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'Progress berhasil disimpan.'
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal menyimpan progress: ' + error.message
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

function saveJournalReflection(data) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);

    const activeUser = validateActiveUser_(data.user || {});
    const idUser = String(activeUser.idUser || '').trim();
    const kodeResponden = String(activeUser.kodeResponden || '').trim();

    const moduleId = String(data.moduleId || 'MOD-001').trim();
    const lessonId = String(data.lessonId || '').trim();
    const exerciseId = String(data.exerciseId || '').trim();
    const tipeJurnal = String(data.tipeJurnal || 'SELF_REFLECTION').trim();
    const pertanyaan = String(data.pertanyaan || 'Apa yang kamu rasakan hari ini?').trim();
    const jawaban = String(data.jawaban || '').trim();
    const mood = String(data.mood || '').trim();

    if (!idUser || !kodeResponden) {
      return {
        success: false,
        message: 'Data user tidak valid. Silakan login ulang.'
      };
    }

    if (!jawaban) {
      return {
        success: false,
        message: 'Jurnal refleksi belum boleh kosong.'
      };
    }

    const sheet = getSheetByName_(APP_CONFIG.SHEETS.JOURNALS);
    const now = new Date();

    sheet.appendRow([
      generateId_('JRN'),
      idUser,
      kodeResponden,
      moduleId,
      lessonId,
      exerciseId,
      tipeJurnal,
      pertanyaan,
      jawaban,
      mood,
      now
    ]);

    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'Jurnal refleksi berhasil disimpan.'
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal menyimpan jurnal: ' + error.message
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}


function createReminder(data) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);

    const activeUser = validateActiveUser_(data.user || {});
    const idUser = String(activeUser.idUser || '').trim();
    const kodeResponden = String(activeUser.kodeResponden || '').trim();
    const judul = String(data.judul || '').trim();
    const pesan = String(data.pesan || '').trim();
    const tipe = String(data.tipe || 'DAILY').trim();

    if (!idUser || !kodeResponden) {
      return {
        success: false,
        message: 'Data user tidak valid. Silakan login ulang.'
      };
    }

    if (!judul || !pesan) {
      return {
        success: false,
        message: 'Judul dan pesan reminder wajib diisi.'
      };
    }

    const sheet = getSheetByName_(APP_CONFIG.SHEETS.REMINDERS);
    const now = new Date();

    sheet.appendRow([
      generateId_('REM'),
      idUser,
      kodeResponden,
      judul,
      pesan,
      tipe,
      'ACTIVE',
      now,
      now
    ]);

    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'Reminder berhasil ditambahkan.'
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal menambahkan reminder: ' + error.message
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

function disableReminder(data) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);

    const activeUser = validateActiveUser_(data.user || {});
    const idUser = String(activeUser.idUser || '').trim();
    const reminderId = String(data.reminderId || '').trim();

    if (!idUser || !reminderId) {
      return {
        success: false,
        message: 'Data reminder belum lengkap.'
      };
    }

    const sheet = getSheetByName_(APP_CONFIG.SHEETS.REMINDERS);
    const rows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.REMINDERS, REMINDER_HEADERS);

    const reminder = rows.find(function(row) {
      return String(row.REMINDER_ID) === reminderId && String(row.ID_USER) === idUser;
    });

    if (!reminder) {
      return {
        success: false,
        message: 'Reminder tidak ditemukan.'
      };
    }

    const now = new Date();

    sheet.getRange(reminder.rowNumber, 7).setValue('INACTIVE');
    sheet.getRange(reminder.rowNumber, 9).setValue(now);

    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'Reminder berhasil dinonaktifkan.'
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal menonaktifkan reminder: ' + error.message
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

function saveExerciseReflection(data) {
  return saveJournalReflection(data);
}


function ensureLmsSeedData_() {
  const ss = getSpreadsheet_();

  const requiredSheets = [
    APP_CONFIG.SHEETS.USERS,
    APP_CONFIG.SHEETS.MODULES,
    APP_CONFIG.SHEETS.LESSONS,
    APP_CONFIG.SHEETS.EXERCISES,
    APP_CONFIG.SHEETS.JOURNALS,
    APP_CONFIG.SHEETS.USER_PROGRESS,
    APP_CONFIG.SHEETS.REMINDERS
  ];

  const missingSheet = requiredSheets.some(function(sheetName) {
    return !ss.getSheetByName(sheetName);
  });

  if (missingSheet) {
    setupDatabase();
    return;
  }

  const modulesSheet = ss.getSheetByName(APP_CONFIG.SHEETS.MODULES);
  const lessonsSheet = ss.getSheetByName(APP_CONFIG.SHEETS.LESSONS);
  const exercisesSheet = ss.getSheetByName(APP_CONFIG.SHEETS.EXERCISES);

  if (modulesSheet.getLastRow() < 2 || lessonsSheet.getLastRow() < 2 || exercisesSheet.getLastRow() < 2) {
    seedInitialLmsData_(ss);
    SpreadsheetApp.flush();
  }
}

function diagnosticLmsData() {
  try {
    ensureLmsSeedData_();

    const ss = getSpreadsheet_();

    return {
      success: true,
      spreadsheetName: ss.getName(),
      modulesRows: ss.getSheetByName(APP_CONFIG.SHEETS.MODULES).getLastRow(),
      lessonsRows: ss.getSheetByName(APP_CONFIG.SHEETS.LESSONS).getLastRow(),
      exercisesRows: ss.getSheetByName(APP_CONFIG.SHEETS.EXERCISES).getLastRow(),
      message: 'Data modul berhasil dicek.'
    };

  } catch (error) {
    return {
      success: false,
      message: 'Diagnostik LMS gagal: ' + error.message
    };
  }
}


function sendOtpEmail_(email, nama, otp) {
  const subject = 'Kode Verifikasi LMS Self-Compassion';
  const expiredMinutes = APP_CONFIG.OTP_EXPIRED_MINUTES;

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;background:#f6f7fb;padding:24px;color:#111827;">
      <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:20px;padding:28px;border:1px solid #e5e7eb;">
        <h2 style="margin:0 0 12px;color:#4f46e5;">Verifikasi Email LMS Self-Compassion</h2>
        <p>Halo ${escapeHtml_(nama || 'Siswa')},</p>
        <p>Gunakan kode OTP berikut untuk memverifikasi akun LMS kamu:</p>
        <div style="font-size:32px;letter-spacing:8px;font-weight:800;text-align:center;background:#f1eeff;color:#4f46e5;border-radius:16px;padding:18px;margin:22px 0;">
          ${otp}
        </div>
        <p>Kode ini berlaku selama <b>${expiredMinutes} menit</b>.</p>
        <p>Jika kamu tidak merasa mendaftar, abaikan email ini.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#6b7280;">Email ini dikirim otomatis oleh sistem LMS Self-Compassion.</p>
      </div>
    </div>
  `;

  const plainBody =
    'Halo ' + (nama || 'Siswa') + ',\n\n' +
    'Kode OTP LMS Self-Compassion kamu adalah: ' + otp + '\n' +
    'Kode ini berlaku selama ' + expiredMinutes + ' menit.\n\n' +
    'Jika kamu tidak merasa mendaftar, abaikan email ini.';

  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody,
    name: APP_CONFIG.EMAIL_SENDER_NAME
  });
}

function hashPassword_(password, email) {
  const raw = email + '|' + password;

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );

  return digest
    .map(function(byte) {
      const value = byte < 0 ? byte + 256 : byte;
      return ('0' + value.toString(16)).slice(-2);
    })
    .join('');
}

function generateOtp_() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateUserId_() {
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyyMMddHHmmss'
  );

  const random = Math.floor(1000 + Math.random() * 9000);

  return 'SISWA-' + timestamp + '-' + random;
}

function generateKodeResponden_() {
  const sheet = getUserSheet_();
  const lastRow = sheet.getLastRow();

  let existingCodes = [];

  if (lastRow >= 2) {
    existingCodes = sheet
      .getRange(2, USER_COL.KODE_RESPONDEN, lastRow - 1, 1)
      .getValues()
      .flat()
      .map(function(value) {
        return String(value || '').trim();
      });
  }

  let kode = '';
  let isDuplicate = true;

  while (isDuplicate) {
    const random = Math.floor(100000 + Math.random() * 900000);
    kode = 'RSP-' + random;
    isDuplicate = existingCodes.indexOf(kode) !== -1;
  }

  return kode;
}

function isValidEmail_(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

function escapeHtml_(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function testDatabaseConnection() {
  const ss = getSpreadsheet_();
  const sheet = getUserSheet_();

  return {
    success: true,
    spreadsheetName: ss.getName(),
    userSheetName: sheet.getName(),
    totalRows: sheet.getLastRow()
  };
}

function testSendOtpEmail() {
  const email = Session.getActiveUser().getEmail();

  if (!email) {
    throw new Error('Email user aktif tidak terdeteksi. Jalankan dari akun Google yang valid.');
  }

  sendOtpEmail_(email, 'Tester', '123456');

  return 'Email percobaan OTP sudah dikirim ke: ' + email;
}


function debugGetModulesOnly() {
  ensureLmsSeedData_();

  const modules = getAllRowsAsObjects_(APP_CONFIG.SHEETS.MODULES, MODULE_HEADERS);
  const lessons = getAllRowsAsObjects_(APP_CONFIG.SHEETS.LESSONS, LESSON_HEADERS);

  return {
    success: true,
    modulesCount: modules.length,
    lessonsCount: lessons.length,
    firstModule: modules.length ? modules[0] : null,
    firstLesson: lessons.length ? lessons[0] : null
  };
}

function getPublicModulesData() {
  try {
    ensureLmsSeedData_();

    let modules = getAllRowsAsObjects_(APP_CONFIG.SHEETS.MODULES, MODULE_HEADERS)
      .filter(function(item) {
        const status = String(item.STATUS || '').trim().toUpperCase();
        return status === '' || status === 'ACTIVE';
      })
      .sort(function(a, b) {
        return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
      });

    const lessons = getAllRowsAsObjects_(APP_CONFIG.SHEETS.LESSONS, LESSON_HEADERS)
      .filter(function(item) {
        const status = String(item.STATUS || '').trim().toUpperCase();
        return status === '' || status === 'ACTIVE';
      })
      .sort(function(a, b) {
        const modCompare = String(a.MODULE_ID || '').localeCompare(String(b.MODULE_ID || ''));
        if (modCompare !== 0) return modCompare;
        return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
      });

    if (modules.length === 0 && lessons.length > 0) {
      const moduleMap = {};
      lessons.forEach(function(lesson) {
        const moduleId = String(lesson.MODULE_ID || '').trim();
        if (!moduleId) return;

        if (!moduleMap[moduleId]) {
          moduleMap[moduleId] = {
            MODULE_ID: moduleId,
            URUTAN: Object.keys(moduleMap).length + 1,
            JUDUL: 'Modul ' + moduleId.replace('MOD-', ''),
            DESKRIPSI: 'Materi pembelajaran self-compassion.',
            TIPE: 'MODUL',
            STATUS: 'ACTIVE'
          };
        }
      });

      modules = Object.keys(moduleMap).map(function(key) {
        return moduleMap[key];
      });
    }

    const moduleData = modules.map(function(module) {
      const moduleLessons = lessons
        .filter(function(lesson) {
          return String(lesson.MODULE_ID || '').trim() === String(module.MODULE_ID || '').trim();
        })
        .sort(function(a, b) {
          return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
        });

      return {
        moduleId: module.MODULE_ID,
        urutan: module.URUTAN,
        judul: module.JUDUL,
        deskripsi: module.DESKRIPSI,
        tipe: module.TIPE,
        totalLessons: moduleLessons.length,
        completedLessons: 0,
        percentage: 0,
        status: Number(module.URUTAN || 0) === 1 ? 'BERJALAN' : 'TERKUNCI',
        lessons: moduleLessons.map(function(lesson) {
          return {
            lessonId: lesson.LESSON_ID,
            moduleId: lesson.MODULE_ID,
            urutan: lesson.URUTAN,
            judul: lesson.JUDUL,
            tipeKonten: lesson.TIPE_KONTEN,
            konten: lesson.KONTEN,
            videoUrl: lesson.VIDEO_URL,
            durasiMenit: lesson.DURASI_MENIT,
            completed: false
          };
        })
      };
    });

    return {
      success: true,
      modules: moduleData,
      stats: {
        totalModules: moduleData.length,
        completedModules: 0,
        totalLessons: lessons.length,
        completedLessons: 0,
        totalJournals: 0,
        overallProgress: 0
      },
      reminders: [],
      recentJournals: []
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal mengambil modul publik: ' + error.message
    };
  }
}

function quickReadLessons() {
  const sheet = getSheetByName_(APP_CONFIG.SHEETS.LESSONS);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  return {
    success: true,
    sheetName: sheet.getName(),
    lastRow: lastRow,
    lastCol: lastCol,
    sample: lastRow >= 2 ? sheet.getRange(2, 1, Math.min(lastRow - 1, 3), Math.min(lastCol, 11)).getValues() : []
  };
}


function debugStudentDashboardByEmail(email) {
  const user = findUserByEmail_(String(email || '').trim().toLowerCase());

  if (!user) {
    return {
      success: false,
      message: 'User tidak ditemukan.'
    };
  }

  return getStudentDashboardData({
    idUser: user.idUser,
    kodeResponden: user.kodeResponden,
    email: user.email
  });
}


function getModuleCatalogData() {
  try {
    ensureLmsSeedData_();

    let modules = getAllRowsAsObjects_(APP_CONFIG.SHEETS.MODULES, MODULE_HEADERS)
      .filter(function(item) {
        const status = String(item.STATUS || '').trim().toUpperCase();
        return status === '' || status === 'ACTIVE';
      })
      .sort(function(a, b) {
        return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
      });

    const lessons = getAllRowsAsObjects_(APP_CONFIG.SHEETS.LESSONS, LESSON_HEADERS)
      .filter(function(item) {
        const status = String(item.STATUS || '').trim().toUpperCase();
        return status === '' || status === 'ACTIVE';
      })
      .sort(function(a, b) {
        const modCompare = String(a.MODULE_ID || '').localeCompare(String(b.MODULE_ID || ''));
        if (modCompare !== 0) return modCompare;
        return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
      });

    if (modules.length === 0 && lessons.length > 0) {
      const moduleMap = {};
      lessons.forEach(function(lesson) {
        const moduleId = String(lesson.MODULE_ID || '').trim();
        if (!moduleId) return;

        if (!moduleMap[moduleId]) {
          moduleMap[moduleId] = {
            MODULE_ID: moduleId,
            URUTAN: Object.keys(moduleMap).length + 1,
            JUDUL: 'Modul ' + moduleId.replace('MOD-', ''),
            DESKRIPSI: 'Materi pembelajaran self-compassion.',
            TIPE: 'MODUL',
            STATUS: 'ACTIVE'
          };
        }
      });

      modules = Object.keys(moduleMap).map(function(key) {
        return moduleMap[key];
      });
    }

    const moduleData = modules.map(function(module) {
      const moduleLessons = lessons
        .filter(function(lesson) {
          return String(lesson.MODULE_ID || '').trim() === String(module.MODULE_ID || '').trim();
        })
        .sort(function(a, b) {
          return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
        });

      return {
        moduleId: module.MODULE_ID,
        urutan: module.URUTAN,
        judul: module.JUDUL,
        deskripsi: module.DESKRIPSI,
        tipe: module.TIPE,
        totalLessons: moduleLessons.length,
        completedLessons: 0,
        percentage: 0,
        status: Number(module.URUTAN || 0) === 1 ? 'BERJALAN' : 'TERKUNCI',
        lessons: moduleLessons.map(function(lesson) {
          return {
            lessonId: lesson.LESSON_ID,
            moduleId: lesson.MODULE_ID,
            urutan: lesson.URUTAN,
            judul: lesson.JUDUL,
            tipeKonten: lesson.TIPE_KONTEN,
            konten: lesson.KONTEN,
            videoUrl: lesson.VIDEO_URL,
            durasiMenit: lesson.DURASI_MENIT,
            completed: false
          };
        })
      };
    });

    return {
      success: true,
      modules: moduleData,
      stats: {
        totalModules: moduleData.length,
        completedModules: 0,
        totalLessons: lessons.length,
        completedLessons: 0,
        totalJournals: 0,
        overallProgress: 0
      },
      reminders: [],
      recentJournals: []
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal mengambil katalog modul: ' + error.message
    };
  }
}


function getModulesForPage() {
  try {
    const ss = getSpreadsheet_();

    let modulesSheet = ss.getSheetByName(APP_CONFIG.SHEETS.MODULES);
    let lessonsSheet = ss.getSheetByName(APP_CONFIG.SHEETS.LESSONS);

    if (!modulesSheet || !lessonsSheet) {
      setupDatabase();
      modulesSheet = ss.getSheetByName(APP_CONFIG.SHEETS.MODULES);
      lessonsSheet = ss.getSheetByName(APP_CONFIG.SHEETS.LESSONS);
    }

    if (!modulesSheet || !lessonsSheet) {
      return {
        success: false,
        message: 'Sheet MODULES atau LESSONS tidak ditemukan.'
      };
    }

    const moduleRows = modulesSheet.getLastRow() >= 2
      ? modulesSheet.getRange(2, 1, modulesSheet.getLastRow() - 1, MODULE_HEADERS.length).getValues()
      : [];

    const lessonRows = lessonsSheet.getLastRow() >= 2
      ? lessonsSheet.getRange(2, 1, lessonsSheet.getLastRow() - 1, LESSON_HEADERS.length).getValues()
      : [];

    let modules = moduleRows
      .map(function(row) {
        return {
          moduleId: row[0],
          urutan: row[1],
          judul: row[2],
          deskripsi: row[3],
          tipe: row[4],
          statusRaw: row[5]
        };
      })
      .filter(function(module) {
        const status = String(module.statusRaw || '').trim().toUpperCase();
        return status === '' || status === 'ACTIVE';
      })
      .sort(function(a, b) {
        return Number(a.urutan || 0) - Number(b.urutan || 0);
      });

    const lessons = lessonRows
      .map(function(row) {
        return {
          lessonId: row[0],
          moduleId: row[1],
          urutan: row[2],
          judul: row[3],
          tipeKonten: row[4],
          konten: row[5],
          videoUrl: row[6],
          durasiMenit: row[7],
          statusRaw: row[8]
        };
      })
      .filter(function(lesson) {
        const status = String(lesson.statusRaw || '').trim().toUpperCase();
        return status === '' || status === 'ACTIVE';
      })
      .sort(function(a, b) {
        const modCompare = String(a.moduleId || '').localeCompare(String(b.moduleId || ''));
        if (modCompare !== 0) return modCompare;
        return Number(a.urutan || 0) - Number(b.urutan || 0);
      });

    if (modules.length === 0 && lessons.length > 0) {
      const moduleMap = {};
      lessons.forEach(function(lesson) {
        const moduleId = String(lesson.moduleId || '').trim();
        if (!moduleId) return;

        if (!moduleMap[moduleId]) {
          moduleMap[moduleId] = {
            moduleId: moduleId,
            urutan: Object.keys(moduleMap).length + 1,
            judul: 'Modul ' + moduleId.replace('MOD-', ''),
            deskripsi: 'Materi pembelajaran self-compassion.',
            tipe: 'MODUL'
          };
        }
      });

      modules = Object.keys(moduleMap).map(function(key) {
        return moduleMap[key];
      });
    }

    const moduleData = modules.map(function(module) {
      const moduleLessons = lessons.filter(function(lesson) {
        return String(lesson.moduleId || '').trim() === String(module.moduleId || '').trim();
      });

      return {
        moduleId: module.moduleId,
        urutan: module.urutan,
        judul: module.judul,
        deskripsi: module.deskripsi,
        tipe: module.tipe,
        totalLessons: moduleLessons.length,
        completedLessons: 0,
        percentage: 0,
        status: Number(module.urutan || 0) === 1 ? 'BERJALAN' : 'TERKUNCI',
        lessons: moduleLessons.map(function(lesson) {
          return {
            lessonId: lesson.lessonId,
            moduleId: lesson.moduleId,
            urutan: lesson.urutan,
            judul: lesson.judul,
            tipeKonten: lesson.tipeKonten,
            konten: lesson.konten,
            videoUrl: lesson.videoUrl,
            durasiMenit: lesson.durasiMenit,
            completed: false
          };
        })
      };
    });

    return {
      success: true,
      debug: {
        spreadsheetName: ss.getName(),
        modulesSheetRows: modulesSheet.getLastRow(),
        lessonsSheetRows: lessonsSheet.getLastRow(),
        modulesReturned: moduleData.length,
        lessonsReturned: lessons.length
      },
      modules: moduleData,
      stats: {
        totalModules: moduleData.length,
        completedModules: 0,
        totalLessons: lessons.length,
        completedLessons: 0,
        totalJournals: 0,
        overallProgress: 0
      },
      reminders: [],
      recentJournals: []
    };

  } catch (error) {
    return {
      success: false,
      message: 'getModulesForPage error: ' + error.message
    };
  }
}

function testModulesForPage() {
  return getModulesForPage();
}


/**
 * PATCH PERSONAL PROGRESS - memakai UI versi sebelumnya.
 * Jangan hapus fungsi lama; frontend akan memanggil fungsi PATCH ini.
 * Progress dibaca personal berdasarkan KODE_RESPONDEN, fallback ID_USER.
 */
function getStudentDashboardPersonalPatch(email) {
  try {
    ensureLmsSeedData_();

    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return {
        success: false,
        message: 'Email siswa kosong. Silakan login ulang.'
      };
    }

    const user = findUserByEmail_(cleanEmail);

    if (!user) {
      return {
        success: false,
        message: 'User tidak ditemukan di sheet USERS: ' + cleanEmail
      };
    }

    return buildPersonalDashboardPatch_(user);

  } catch (error) {
    return {
      success: false,
      message: 'Gagal membaca progress personal: ' + error.message
    };
  }
}

function buildPersonalDashboardPatch_(user) {
  const idUser = String(user.idUser || '').trim();
  const kodeResponden = String(user.kodeResponden || '').trim();

  if (!kodeResponden) {
    throw new Error('KODE_RESPONDEN kosong untuk user ini.');
  }

  let modules = getAllRowsAsObjects_(APP_CONFIG.SHEETS.MODULES, MODULE_HEADERS)
    .filter(function(item) {
      const status = String(item.STATUS || '').trim().toUpperCase();
      return status === '' || status === 'ACTIVE';
    })
    .sort(function(a, b) {
      return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
    });

  const lessons = getAllRowsAsObjects_(APP_CONFIG.SHEETS.LESSONS, LESSON_HEADERS)
    .filter(function(item) {
      const status = String(item.STATUS || '').trim().toUpperCase();
      return status === '' || status === 'ACTIVE';
    })
    .sort(function(a, b) {
      const modCompare = String(a.MODULE_ID || '').localeCompare(String(b.MODULE_ID || ''));
      if (modCompare !== 0) return modCompare;
      return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
    });

  if (modules.length === 0 && lessons.length > 0) {
    const moduleMap = {};
    lessons.forEach(function(lesson) {
      const moduleId = String(lesson.MODULE_ID || '').trim();
      if (!moduleId) return;

      if (!moduleMap[moduleId]) {
        moduleMap[moduleId] = {
          MODULE_ID: moduleId,
          URUTAN: Object.keys(moduleMap).length + 1,
          JUDUL: 'Modul ' + moduleId.replace('MOD-', ''),
          DESKRIPSI: 'Materi pembelajaran self-compassion.',
          TIPE: 'MODUL',
          STATUS: 'ACTIVE'
        };
      }
    });

    modules = Object.keys(moduleMap).map(function(key) {
      return moduleMap[key];
    });
  }

  const progressRows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.USER_PROGRESS, USER_PROGRESS_HEADERS)
    .filter(function(row) {
      const rowKode = String(row.KODE_RESPONDEN || '').trim();
      const rowId = String(row.ID_USER || '').trim();
      const rowStatus = String(row.STATUS_PROGRESS || '').trim().toUpperCase();

      return rowStatus === 'COMPLETED' &&
        (
          rowKode === kodeResponden ||
          (idUser && rowId === idUser)
        );
    });

  const journalRows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.JOURNALS, JOURNAL_HEADERS)
    .filter(function(row) {
      const rowKode = String(row.KODE_RESPONDEN || '').trim();
      const rowId = String(row.ID_USER || '').trim();

      return rowKode === kodeResponden ||
        (idUser && rowId === idUser);
    });

  const reminderRows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.REMINDERS, REMINDER_HEADERS)
    .filter(function(row) {
      const rowKode = String(row.KODE_RESPONDEN || '').trim();
      const rowId = String(row.ID_USER || '').trim();
      const status = String(row.STATUS || '').trim().toUpperCase();

      return status === 'ACTIVE' &&
        (
          rowKode === kodeResponden ||
          (idUser && rowId === idUser)
        );
    });

  const completedLessonKeys = {};
  progressRows.forEach(function(row) {
    const lessonId = String(row.LESSON_ID || '').trim();

    if (lessonId) {
      completedLessonKeys[lessonId] = true;
    }
  });

  const moduleData = modules.map(function(module) {
    const moduleLessons = lessons
      .filter(function(lesson) {
        return String(lesson.MODULE_ID || '').trim() === String(module.MODULE_ID || '').trim();
      })
      .sort(function(a, b) {
        return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
      });

    const totalLessons = moduleLessons.length;
    const completedLessons = moduleLessons.filter(function(lesson) {
      return completedLessonKeys[String(lesson.LESSON_ID || '').trim()] === true;
    }).length;

    const percentage = totalLessons > 0
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;

    let status = 'TERKUNCI';

    if (
      Number(module.URUTAN || 0) === 1 ||
      percentage > 0 ||
      previousModuleCompletedPatch_(modules, lessons, completedLessonKeys, module)
    ) {
      status = percentage >= 100 && totalLessons > 0 ? 'SELESAI' : 'BERJALAN';
    }

    return {
      moduleId: module.MODULE_ID,
      urutan: module.URUTAN,
      judul: module.JUDUL,
      deskripsi: module.DESKRIPSI,
      tipe: module.TIPE,
      totalLessons: totalLessons,
      completedLessons: completedLessons,
      percentage: percentage,
      status: status,
      lessons: moduleLessons.map(function(lesson) {
        return {
          lessonId: lesson.LESSON_ID,
          moduleId: lesson.MODULE_ID,
          urutan: lesson.URUTAN,
          judul: lesson.JUDUL,
          tipeKonten: lesson.TIPE_KONTEN,
          konten: lesson.KONTEN,
          videoUrl: lesson.VIDEO_URL,
          durasiMenit: lesson.DURASI_MENIT,
          completed: completedLessonKeys[String(lesson.LESSON_ID || '').trim()] === true
        };
      })
    };
  });

  const totalModules = moduleData.length;
  const completedModules = moduleData.filter(function(module) {
    return module.status === 'SELESAI';
  }).length;

  const totalLessons = lessons.length;
  const completedLessons = Object.keys(completedLessonKeys).length;

  const overallProgress = totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0;

  return {
    success: true,
    user: {
      idUser: user.idUser,
      kodeResponden: user.kodeResponden,
      nama: user.nama,
      email: user.email,
      kelas: user.kelas,
      sekolah: user.sekolah,
      role: user.role
    },
    debugPersonal: {
      matchedProgressRows: progressRows.length,
      kodeResponden: kodeResponden,
      idUser: idUser
    },
    modules: moduleData,
    stats: {
      totalModules: totalModules,
      completedModules: completedModules,
      totalLessons: totalLessons,
      completedLessons: completedLessons,
      totalJournals: journalRows.length,
      overallProgress: overallProgress
    },
    reminders: reminderRows.map(function(row) {
      return {
        reminderId: row.REMINDER_ID,
        title: row.JUDUL,
        message: row.PESAN,
        type: row.TIPE,
        createdAt: row.CREATED_AT
      };
    }),
    recentJournals: journalRows.slice(-5).reverse().map(function(row) {
      return {
        pertanyaan: row.PERTANYAAN,
        jawaban: row.JAWABAN,
        mood: row.MOOD,
        createdAt: row.CREATED_AT
      };
    })
  };
}

function previousModuleCompletedPatch_(modules, lessons, completedLessonKeys, currentModule) {
  const currentOrder = Number(currentModule.URUTAN || 0);

  if (currentOrder <= 1) {
    return true;
  }

  const previousModule = modules.find(function(module) {
    return Number(module.URUTAN || 0) === currentOrder - 1;
  });

  if (!previousModule) {
    return false;
  }

  const previousLessons = lessons.filter(function(lesson) {
    return String(lesson.MODULE_ID || '').trim() === String(previousModule.MODULE_ID || '').trim();
  });

  if (previousLessons.length === 0) {
    return true;
  }

  return previousLessons.every(function(lesson) {
    return completedLessonKeys[String(lesson.LESSON_ID || '').trim()] === true;
  });
}

function completeLessonPersonalPatch(email, moduleId, lessonId) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);

    const cleanEmail = String(email || '').trim().toLowerCase();
    const user = findUserByEmail_(cleanEmail);

    if (!user) {
      return {
        success: false,
        message: 'User tidak ditemukan. Silakan logout lalu login ulang.'
      };
    }

    const idUser = String(user.idUser || '').trim();
    const kodeResponden = String(user.kodeResponden || '').trim();
    const cleanModuleId = String(moduleId || '').trim();
    const cleanLessonId = String(lessonId || '').trim();

    if (!kodeResponden || !cleanModuleId || !cleanLessonId) {
      return {
        success: false,
        message: 'Data progress belum lengkap.'
      };
    }

    const sheet = getSheetByName_(APP_CONFIG.SHEETS.USER_PROGRESS);
    const rows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.USER_PROGRESS, USER_PROGRESS_HEADERS);

    const existing = rows.find(function(row) {
      const rowKode = String(row.KODE_RESPONDEN || '').trim();
      const rowId = String(row.ID_USER || '').trim();

      return (
        rowKode === kodeResponden ||
        (idUser && rowId === idUser)
      ) &&
        String(row.MODULE_ID || '').trim() === cleanModuleId &&
        String(row.LESSON_ID || '').trim() === cleanLessonId;
    });

    const now = new Date();

    if (existing) {
      sheet.getRange(existing.rowNumber, 2).setValue(idUser);
      sheet.getRange(existing.rowNumber, 3).setValue(kodeResponden);
      sheet.getRange(existing.rowNumber, 6).setValue('COMPLETED');
      sheet.getRange(existing.rowNumber, 7).setValue(100);
      sheet.getRange(existing.rowNumber, 9).setValue(now);
      sheet.getRange(existing.rowNumber, 10).setValue(now);
    } else {
      sheet.appendRow([
        generateId_('PROG'),
        idUser,
        kodeResponden,
        cleanModuleId,
        cleanLessonId,
        'COMPLETED',
        100,
        now,
        now,
        now
      ]);
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'Progress berhasil disimpan.',
      dashboard: buildPersonalDashboardPatch_(user)
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal menyimpan progress: ' + error.message
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

function debugPersonalPatch(email) {
  return getStudentDashboardPersonalPatch(email);
}


function debugProgressPatchResult(email) {
  const result = getStudentDashboardPersonalPatch(email);

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    debugPersonal: result.debugPersonal,
    stats: result.stats,
    modules: result.modules.map(function(module) {
      return {
        moduleId: module.moduleId,
        judul: module.judul,
        completedLessons: module.completedLessons,
        totalLessons: module.totalLessons,
        percentage: module.percentage,
        status: module.status
      };
    })
  };
}


/**
 * SESSION PROGRESS FIX
 * Versi ini sengaja tidak bergantung pada lookup email USERS saat load progress,
 * karena sidebar sudah membawa ID_USER + KODE_RESPONDEN dari sesi login.
 * Ini mencegah error "Data personal siswa belum bisa dimuat" dan tetap personal per siswa.
 */
function getDashboardBySessionPatch(sessionUser) {
  try {
    ensureLmsSeedData_();

    const user = normalizeSessionUserPatch_(sessionUser);

    if (!user.kodeResponden && !user.idUser && !user.email) {
      return {
        success: false,
        message: 'Sesi siswa kosong. Silakan logout lalu login ulang.'
      };
    }

    // Jika email cocok ke USERS, perbarui data user dari database.
    // Kalau tidak, tetap gunakan data session agar progress berdasarkan RSP tetap bisa terbaca.
    const dbUser = user.email ? findUserByEmail_(String(user.email).trim().toLowerCase()) : null;

    if (dbUser) {
      user.idUser = String(dbUser.idUser || user.idUser || '').trim();
      user.kodeResponden = String(dbUser.kodeResponden || user.kodeResponden || '').trim();
      user.nama = dbUser.nama || user.nama;
      user.email = dbUser.email || user.email;
      user.kelas = dbUser.kelas || user.kelas || 'XI';
      user.sekolah = dbUser.sekolah || user.sekolah;
      user.role = dbUser.role || user.role || 'SISWA';
    }

    return buildDashboardByIdentityPatch_(user);

  } catch (error) {
    return {
      success: false,
      message: 'Gagal membaca dashboard sesi: ' + error.message
    };
  }
}

function normalizeSessionUserPatch_(sessionUser) {
  const raw = sessionUser || {};

  return {
    idUser: String(raw.idUser || raw.ID_USER || '').trim(),
    kodeResponden: String(raw.kodeResponden || raw.KODE_RESPONDEN || '').trim(),
    nama: String(raw.nama || raw.NAMA || 'Siswa').trim(),
    email: String(raw.email || raw.EMAIL || '').trim().toLowerCase(),
    kelas: String(raw.kelas || raw.KELAS || 'XI').trim(),
    sekolah: String(raw.sekolah || raw.SEKOLAH || '').trim(),
    role: String(raw.role || raw.ROLE || 'SISWA').trim()
  };
}

function identityMatchPatch_(row, user) {
  const rowKode = String(row.KODE_RESPONDEN || '').trim();
  const rowId = String(row.ID_USER || '').trim();

  return (
    (user.kodeResponden && rowKode === user.kodeResponden) ||
    (user.idUser && rowId === user.idUser)
  );
}

function buildDashboardByIdentityPatch_(user) {
  let modules = getAllRowsAsObjects_(APP_CONFIG.SHEETS.MODULES, MODULE_HEADERS)
    .filter(function(item) {
      const status = String(item.STATUS || '').trim().toUpperCase();
      return status === '' || status === 'ACTIVE';
    })
    .sort(function(a, b) {
      return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
    });

  const lessons = getAllRowsAsObjects_(APP_CONFIG.SHEETS.LESSONS, LESSON_HEADERS)
    .filter(function(item) {
      const status = String(item.STATUS || '').trim().toUpperCase();
      return status === '' || status === 'ACTIVE';
    })
    .sort(function(a, b) {
      const modCompare = String(a.MODULE_ID || '').localeCompare(String(b.MODULE_ID || ''));
      if (modCompare !== 0) return modCompare;
      return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
    });

  if (modules.length === 0 && lessons.length > 0) {
    const moduleMap = {};

    lessons.forEach(function(lesson) {
      const moduleId = String(lesson.MODULE_ID || '').trim();

      if (!moduleId) return;

      if (!moduleMap[moduleId]) {
        moduleMap[moduleId] = {
          MODULE_ID: moduleId,
          URUTAN: Object.keys(moduleMap).length + 1,
          JUDUL: 'Modul ' + moduleId.replace('MOD-', ''),
          DESKRIPSI: 'Materi pembelajaran self-compassion.',
          TIPE: 'MODUL',
          STATUS: 'ACTIVE'
        };
      }
    });

    modules = Object.keys(moduleMap).map(function(key) {
      return moduleMap[key];
    });
  }

  const progressRows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.USER_PROGRESS, USER_PROGRESS_HEADERS)
    .filter(function(row) {
      return identityMatchPatch_(row, user) &&
        String(row.STATUS_PROGRESS || '').trim().toUpperCase() === 'COMPLETED';
    });

  const journalRows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.JOURNALS, JOURNAL_HEADERS)
    .filter(function(row) {
      return identityMatchPatch_(row, user);
    });

  const reminderRows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.REMINDERS, REMINDER_HEADERS)
    .filter(function(row) {
      return identityMatchPatch_(row, user) &&
        String(row.STATUS || '').trim().toUpperCase() === 'ACTIVE';
    });

  const completedLessonKeys = {};
  progressRows.forEach(function(row) {
    const lessonId = String(row.LESSON_ID || '').trim();
    if (lessonId) completedLessonKeys[lessonId] = true;
  });

  const moduleData = modules.map(function(module) {
    const moduleLessons = lessons
      .filter(function(lesson) {
        return String(lesson.MODULE_ID || '').trim() === String(module.MODULE_ID || '').trim();
      })
      .sort(function(a, b) {
        return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
      });

    const totalLessons = moduleLessons.length;
    const completedLessons = moduleLessons.filter(function(lesson) {
      return completedLessonKeys[String(lesson.LESSON_ID || '').trim()] === true;
    }).length;

    const percentage = totalLessons > 0
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;

    let status = 'TERKUNCI';

    if (
      Number(module.URUTAN || 0) === 1 ||
      percentage > 0 ||
      previousModuleCompletedSessionPatch_(modules, lessons, completedLessonKeys, module)
    ) {
      status = percentage >= 100 && totalLessons > 0 ? 'SELESAI' : 'BERJALAN';
    }

    return {
      moduleId: module.MODULE_ID,
      urutan: module.URUTAN,
      judul: module.JUDUL,
      deskripsi: module.DESKRIPSI,
      tipe: module.TIPE,
      totalLessons: totalLessons,
      completedLessons: completedLessons,
      percentage: percentage,
      status: status,
      lessons: moduleLessons.map(function(lesson) {
        return {
          lessonId: lesson.LESSON_ID,
          moduleId: lesson.MODULE_ID,
          urutan: lesson.URUTAN,
          judul: lesson.JUDUL,
          tipeKonten: lesson.TIPE_KONTEN,
          konten: lesson.KONTEN,
          videoUrl: lesson.VIDEO_URL,
          durasiMenit: lesson.DURASI_MENIT,
          completed: completedLessonKeys[String(lesson.LESSON_ID || '').trim()] === true
        };
      })
    };
  });

  const totalModules = moduleData.length;
  const completedModules = moduleData.filter(function(module) {
    return module.status === 'SELESAI';
  }).length;

  const totalLessons = lessons.length;
  const completedLessons = Object.keys(completedLessonKeys).length;
  const overallProgress = totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0;

  return {
    success: true,
    user: {
      idUser: user.idUser,
      kodeResponden: user.kodeResponden,
      nama: user.nama,
      email: user.email,
      kelas: user.kelas,
      sekolah: user.sekolah,
      role: user.role
    },
    debugSession: {
      idUser: user.idUser,
      kodeResponden: user.kodeResponden,
      email: user.email,
      matchedProgressRows: progressRows.length
    },
    modules: moduleData,
    stats: {
      totalModules: totalModules,
      completedModules: completedModules,
      totalLessons: totalLessons,
      completedLessons: completedLessons,
      totalJournals: journalRows.length,
      overallProgress: overallProgress
    },
    reminders: reminderRows.map(function(row) {
      return {
        reminderId: row.REMINDER_ID,
        title: row.JUDUL,
        message: row.PESAN,
        type: row.TIPE,
        createdAt: row.CREATED_AT
      };
    }),
    recentJournals: journalRows.slice(-5).reverse().map(function(row) {
      return {
        pertanyaan: row.PERTANYAAN,
        jawaban: row.JAWABAN,
        mood: row.MOOD,
        createdAt: row.CREATED_AT
      };
    })
  };
}

function previousModuleCompletedSessionPatch_(modules, lessons, completedLessonKeys, currentModule) {
  const currentOrder = Number(currentModule.URUTAN || 0);

  if (currentOrder <= 1) {
    return true;
  }

  const previousModule = modules.find(function(module) {
    return Number(module.URUTAN || 0) === currentOrder - 1;
  });

  if (!previousModule) {
    return false;
  }

  const previousLessons = lessons.filter(function(lesson) {
    return String(lesson.MODULE_ID || '').trim() === String(previousModule.MODULE_ID || '').trim();
  });

  if (previousLessons.length === 0) {
    return true;
  }

  return previousLessons.every(function(lesson) {
    return completedLessonKeys[String(lesson.LESSON_ID || '').trim()] === true;
  });
}

function completeLessonSessionPatch(sessionUser, moduleId, lessonId) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);

    const user = normalizeSessionUserPatch_(sessionUser);

    if (!user.idUser || !user.kodeResponden) {
      const dbUser = user.email ? findUserByEmail_(user.email) : null;

      if (dbUser) {
        user.idUser = String(dbUser.idUser || user.idUser || '').trim();
        user.kodeResponden = String(dbUser.kodeResponden || user.kodeResponden || '').trim();
        user.nama = dbUser.nama || user.nama;
        user.kelas = dbUser.kelas || user.kelas || 'XI';
        user.sekolah = dbUser.sekolah || user.sekolah;
        user.role = dbUser.role || user.role || 'SISWA';
      }
    }

    const cleanModuleId = String(moduleId || '').trim();
    const cleanLessonId = String(lessonId || '').trim();

    if (!user.kodeResponden || !cleanModuleId || !cleanLessonId) {
      return {
        success: false,
        message: 'Data progress belum lengkap. Silakan logout lalu login ulang.'
      };
    }

    const sheet = getSheetByName_(APP_CONFIG.SHEETS.USER_PROGRESS);
    const rows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.USER_PROGRESS, USER_PROGRESS_HEADERS);

    const existing = rows.find(function(row) {
      return identityMatchPatch_(row, user) &&
        String(row.MODULE_ID || '').trim() === cleanModuleId &&
        String(row.LESSON_ID || '').trim() === cleanLessonId;
    });

    const now = new Date();

    if (existing) {
      sheet.getRange(existing.rowNumber, 2).setValue(user.idUser);
      sheet.getRange(existing.rowNumber, 3).setValue(user.kodeResponden);
      sheet.getRange(existing.rowNumber, 6).setValue('COMPLETED');
      sheet.getRange(existing.rowNumber, 7).setValue(100);
      sheet.getRange(existing.rowNumber, 9).setValue(now);
      sheet.getRange(existing.rowNumber, 10).setValue(now);
    } else {
      sheet.appendRow([
        generateId_('PROG'),
        user.idUser,
        user.kodeResponden,
        cleanModuleId,
        cleanLessonId,
        'COMPLETED',
        100,
        now,
        now,
        now
      ]);
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'Progress berhasil disimpan.',
      dashboard: buildDashboardByIdentityPatch_(user)
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal menyimpan progress: ' + error.message
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

function debugSessionProgressPatch(sessionUser) {
  return getDashboardBySessionPatch(sessionUser);
}


/**
 * PROGRESS ONLY FIX
 * Tidak memakai lookup email dan tidak mengembalikan Date.
 * Hanya membaca/menulis progress berdasarkan KODE_RESPONDEN + ID_USER dari session sidebar.
 */
function getProgressOnlyByIdentityPatch(kodeResponden, idUser) {
  try {
    const kode = String(kodeResponden || '').trim();
    const id = String(idUser || '').trim();

    if (!kode && !id) {
      return {
        success: false,
        message: 'Kode responden dan ID user kosong.'
      };
    }

    const rows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.USER_PROGRESS, USER_PROGRESS_HEADERS)
      .filter(function(row) {
        const rowKode = String(row.KODE_RESPONDEN || '').trim();
        const rowId = String(row.ID_USER || '').trim();
        const status = String(row.STATUS_PROGRESS || '').trim().toUpperCase();

        return status === 'COMPLETED' &&
          (
            (kode && rowKode === kode) ||
            (id && rowId === id)
          );
      });

    const completedLessonIds = [];
    const seen = {};

    rows.forEach(function(row) {
      const lessonId = String(row.LESSON_ID || '').trim();

      if (lessonId && !seen[lessonId]) {
        seen[lessonId] = true;
        completedLessonIds.push(lessonId);
      }
    });

    return {
      success: true,
      kodeResponden: kode,
      idUser: id,
      matchedRows: rows.length,
      completedLessonIds: completedLessonIds
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal membaca progress: ' + error.message
    };
  }
}

function saveProgressOnlyByIdentityPatch(kodeResponden, idUser, email, moduleId, lessonId) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(15000);

    let kode = String(kodeResponden || '').trim();
    let id = String(idUser || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanModuleId = String(moduleId || '').trim();
    const cleanLessonId = String(lessonId || '').trim();

    // Jika kode/id kosong, coba isi dari email.
    if ((!kode || !id) && cleanEmail) {
      const dbUser = findUserByEmail_(cleanEmail);

      if (dbUser) {
        kode = kode || String(dbUser.kodeResponden || '').trim();
        id = id || String(dbUser.idUser || '').trim();
      }
    }

    if (!kode || !cleanModuleId || !cleanLessonId) {
      return {
        success: false,
        message: 'Data progress belum lengkap. Silakan logout lalu login ulang.'
      };
    }

    const validation = validateCanCompleteProgressOnlyPatch_(kode, id, cleanModuleId, cleanLessonId);

    if (!validation.allowed) {
      return {
        success: false,
        message: validation.message
      };
    }

    const sheet = getSheetByName_(APP_CONFIG.SHEETS.USER_PROGRESS);
    const rows = getAllRowsAsObjects_(APP_CONFIG.SHEETS.USER_PROGRESS, USER_PROGRESS_HEADERS);

    const existing = rows.find(function(row) {
      const rowKode = String(row.KODE_RESPONDEN || '').trim();
      const rowId = String(row.ID_USER || '').trim();

      return (
        (kode && rowKode === kode) ||
        (id && rowId === id)
      ) &&
        String(row.MODULE_ID || '').trim() === cleanModuleId &&
        String(row.LESSON_ID || '').trim() === cleanLessonId;
    });

    const now = new Date();

    if (existing) {
      sheet.getRange(existing.rowNumber, 2).setValue(id);
      sheet.getRange(existing.rowNumber, 3).setValue(kode);
      sheet.getRange(existing.rowNumber, 6).setValue('COMPLETED');
      sheet.getRange(existing.rowNumber, 7).setValue(100);
      sheet.getRange(existing.rowNumber, 9).setValue(now);
      sheet.getRange(existing.rowNumber, 10).setValue(now);
    } else {
      sheet.appendRow([
        generateId_('PROG'),
        id,
        kode,
        cleanModuleId,
        cleanLessonId,
        'COMPLETED',
        100,
        now,
        now,
        now
      ]);
    }

    SpreadsheetApp.flush();

    const progress = getProgressOnlyByIdentityPatch(kode, id);

    return {
      success: true,
      message: 'Progress berhasil disimpan.',
      progress: progress
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal menyimpan progress: ' + error.message
    };

  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

function debugProgressOnlyByIdentityPatch(kodeResponden, idUser) {
  return getProgressOnlyByIdentityPatch(kodeResponden, idUser);
}


function validateCanCompleteProgressOnlyPatch_(kode, id, moduleId, lessonId) {
  let modules = getAllRowsAsObjects_(APP_CONFIG.SHEETS.MODULES, MODULE_HEADERS)
    .filter(function(item) {
      const status = String(item.STATUS || '').trim().toUpperCase();
      return status === '' || status === 'ACTIVE';
    })
    .sort(function(a, b) {
      return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
    });

  const lessons = getAllRowsAsObjects_(APP_CONFIG.SHEETS.LESSONS, LESSON_HEADERS)
    .filter(function(item) {
      const status = String(item.STATUS || '').trim().toUpperCase();
      return status === '' || status === 'ACTIVE';
    })
    .sort(function(a, b) {
      const modCompare = String(a.MODULE_ID || '').localeCompare(String(b.MODULE_ID || ''));
      if (modCompare !== 0) return modCompare;
      return Number(a.URUTAN || 0) - Number(b.URUTAN || 0);
    });

  if (modules.length === 0 && lessons.length > 0) {
    const moduleMap = {};
    lessons.forEach(function(lesson) {
      const lessonModuleId = String(lesson.MODULE_ID || '').trim();
      if (!lessonModuleId) return;
      if (!moduleMap[lessonModuleId]) {
        moduleMap[lessonModuleId] = {
          MODULE_ID: lessonModuleId,
          URUTAN: Object.keys(moduleMap).length + 1,
          JUDUL: 'Modul ' + lessonModuleId.replace('MOD-', ''),
          STATUS: 'ACTIVE'
        };
      }
    });
    modules = Object.keys(moduleMap).map(function(key) {
      return moduleMap[key];
    });
  }

  const targetModule = modules.find(function(module) {
    return String(module.MODULE_ID || '').trim() === String(moduleId || '').trim();
  });

  if (!targetModule) {
    return { allowed: false, message: 'Modul tidak ditemukan.' };
  }

  const moduleLessons = lessons.filter(function(lesson) {
    return String(lesson.MODULE_ID || '').trim() === String(moduleId || '').trim();
  });

  const targetLesson = moduleLessons.find(function(lesson) {
    return String(lesson.LESSON_ID || '').trim() === String(lessonId || '').trim();
  });

  if (!targetLesson) {
    return { allowed: false, message: 'Aktivitas tidak ditemukan dalam modul ini.' };
  }

  const progress = getProgressOnlyByIdentityPatch(kode, id);

  if (!progress.success) {
    return { allowed: false, message: progress.message };
  }

  const completedMap = {};
  progress.completedLessonIds.forEach(function(completedLessonId) {
    completedMap[String(completedLessonId || '').trim()] = true;
  });

  const completedInModule = moduleLessons.filter(function(lesson) {
    return completedMap[String(lesson.LESSON_ID || '').trim()] === true;
  }).length;

  if (moduleLessons.length > 0 && completedInModule >= moduleLessons.length) {
    return { allowed: false, message: 'Modul ini sudah selesai.' };
  }

  const currentOrder = Number(targetModule.URUTAN || 0);

  if (currentOrder > 1) {
    const previousModule = modules.find(function(module) {
      return Number(module.URUTAN || 0) === currentOrder - 1;
    });

    if (previousModule) {
      const previousLessons = lessons.filter(function(lesson) {
        return String(lesson.MODULE_ID || '').trim() === String(previousModule.MODULE_ID || '').trim();
      });

      const previousDone = previousLessons.length > 0 && previousLessons.every(function(lesson) {
        return completedMap[String(lesson.LESSON_ID || '').trim()] === true;
      });

      if (!previousDone) {
        return { allowed: false, message: 'Modul ini masih terkunci. Selesaikan modul sebelumnya terlebih dahulu.' };
      }
    }
  }

  const nextLesson = moduleLessons.find(function(lesson) {
    return completedMap[String(lesson.LESSON_ID || '').trim()] !== true;
  });

  if (!nextLesson || String(nextLesson.LESSON_ID || '').trim() !== String(lessonId || '').trim()) {
    return { allowed: false, message: 'Selesaikan aktivitas modul secara berurutan.' };
  }

  return { allowed: true, message: 'OK' };
}


/**
 * PROFILE PATCH
 * Update profil siswa dan ganti password berdasarkan session user.
 */
function updateStudentProfilePatch(data) {
  try {
    const userPayload = data && data.user ? data.user : {};
    const email = String(userPayload.email || data.email || '').trim().toLowerCase();

    if (!email) {
      return {
        success: false,
        message: 'Sesi siswa tidak valid. Silakan login ulang.'
      };
    }

    const user = findUserByEmail_(email);

    if (!user) {
      return {
        success: false,
        message: 'Akun siswa tidak ditemukan.'
      };
    }

    const nama = String(data.nama || '').trim();
    const kelas = String(data.kelas || 'XI').trim();
    const sekolah = String(data.sekolah || '').trim();

    if (!nama) {
      return {
        success: false,
        message: 'Nama tidak boleh kosong.'
      };
    }

    const sheet = getUserSheet_();
    const now = new Date();

    sheet.getRange(user.rowNumber, USER_COL.NAMA).setValue(nama);
    sheet.getRange(user.rowNumber, USER_COL.KELAS).setValue(kelas);
    sheet.getRange(user.rowNumber, USER_COL.SEKOLAH).setValue(sekolah);
    sheet.getRange(user.rowNumber, USER_COL.UPDATED_AT).setValue(now);

    SpreadsheetApp.flush();

    const updatedUser = findUserByEmail_(email);

    return {
      success: true,
      message: 'Profil berhasil diperbarui.',
      user: {
        idUser: updatedUser.idUser,
        kodeResponden: updatedUser.kodeResponden,
        nama: updatedUser.nama,
        email: updatedUser.email,
        kelas: updatedUser.kelas,
        sekolah: updatedUser.sekolah,
        role: updatedUser.role
      }
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal memperbarui profil: ' + error.message
    };
  }
}

function changeStudentPasswordPatch(data) {
  try {
    const userPayload = data && data.user ? data.user : {};
    const email = String(userPayload.email || data.email || '').trim().toLowerCase();
    const oldPassword = String(data.oldPassword || '');
    const newPassword = String(data.newPassword || '');

    if (!email) {
      return {
        success: false,
        message: 'Sesi siswa tidak valid. Silakan login ulang.'
      };
    }

    if (!oldPassword || !newPassword) {
      return {
        success: false,
        message: 'Password lama dan password baru wajib diisi.'
      };
    }

    if (newPassword.length < 6) {
      return {
        success: false,
        message: 'Password baru minimal 6 karakter.'
      };
    }

    const user = findUserByEmail_(email);

    if (!user) {
      return {
        success: false,
        message: 'Akun siswa tidak ditemukan.'
      };
    }

    const oldHash = hashPassword_(oldPassword, email);

    if (oldHash !== user.passwordHash) {
      return {
        success: false,
        message: 'Password lama salah.'
      };
    }

    const newHash = hashPassword_(newPassword, email);
    const sheet = getUserSheet_();
    const now = new Date();

    sheet.getRange(user.rowNumber, USER_COL.PASSWORD_HASH).setValue(newHash);
    sheet.getRange(user.rowNumber, USER_COL.UPDATED_AT).setValue(now);

    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'Password berhasil diganti.'
    };

  } catch (error) {
    return {
      success: false,
      message: 'Gagal mengganti password: ' + error.message
    };
  }
}


/**
 * VERCEL API BRIDGE
 * Dipakai saat frontend LMS di-hosting di Vercel.
 * Frontend Vercel memanggil /api/apps-script, lalu proxy Vercel meneruskan request ke doPost ini.
 */
function doPost(e) {
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(request.action || '').trim();
    const args = Array.isArray(request.args) ? request.args : [];

    const allowedActions = {
      loginUser: loginUser,
      registerUser: registerUser,
      verifyOtp: verifyOtp,
      resendOtp: resendOtp,

      getModulesForPage: getModulesForPage,
      getProgressOnlyByIdentityPatch: getProgressOnlyByIdentityPatch,
      saveProgressOnlyByIdentityPatch: saveProgressOnlyByIdentityPatch,

      saveJournalReflection: saveJournalReflection,
      saveExerciseReflection: saveExerciseReflection,
      createReminder: createReminder,
      disableReminder: disableReminder,

      updateStudentProfilePatch: updateStudentProfilePatch,
      changeStudentPasswordPatch: changeStudentPasswordPatch
    };

    if (!action || !allowedActions[action]) {
      return createJsonResponse_({
        success: false,
        message: 'Action API tidak dikenal: ' + action
      });
    }

    const result = allowedActions[action].apply(null, args);

    return createJsonResponse_(result);

  } catch (error) {
    return createJsonResponse_({
      success: false,
      message: 'API Apps Script error: ' + error.message
    });
  }
}

function createJsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}



function testVercelApiBridge() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: 'getModulesForPage',
        args: []
      })
    }
  };

  const response = doPost(mockEvent);
  const content = response.getContent();

  console.log(content);
  return content;
}
