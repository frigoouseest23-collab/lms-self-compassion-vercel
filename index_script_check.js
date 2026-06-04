
    /**
     * Vercel bridge untuk menggantikan google.script.run.
     * Jangan hapus. Ini membuat frontend Vercel tetap bisa memakai kode UI Apps Script lama.
     */
    (function() {
      const API_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxdG8NK4jcFbtU6SFi2pQzbZLroMeNhyIEK6AnOZwGKu6neU8v7lA_b2Qg9Hv_Q39D3/exec';

      function createRunner(successHandler, failureHandler) {
        return new Proxy({}, {
          get(_target, prop) {
            if (prop === 'withSuccessHandler') {
              return function(handler) {
                return createRunner(handler, failureHandler);
              };
            }

            if (prop === 'withFailureHandler') {
              return function(handler) {
                return createRunner(successHandler, handler);
              };
            }

            return async function(...args) {
              try {
                const response = await fetch(API_ENDPOINT, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    action: String(prop),
                    args: args
                  })
                });

                const text = await response.text();
                let result;

                try {
                  result = JSON.parse(text);
                } catch (parseError) {
                  throw new Error('Response API bukan JSON valid: ' + text.slice(0, 160));
                }

                if (!response.ok) {
                  throw new Error(result.message || 'Request API gagal.');
                }

                if (typeof successHandler === 'function') {
                  successHandler(result);
                }

                return result;

              } catch (error) {
                if (typeof failureHandler === 'function') {
                  failureHandler({
                    message: error.message || String(error)
                  });
                } else {
                  console.error(error);
                }

                return null;
              }
            };
          }
        });
      }

      window.google = window.google || {};
      window.google.script = window.google.script || {};
      window.google.script.run = createRunner();
    })();
  
;

    const ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3l18 18"></path><path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6"></path><path d="M9.9 4.3A10.7 10.7 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-3.2 4.4"></path><path d="M6.6 6.6C3.6 8.6 2 12 2 12s3.5 8 10 8a10.6 10.6 0 0 0 4.2-.9"></path></svg>';

    let currentUser = null;
    let dashboardCache = null;
    let selectedModule = null;
    let personalDashboardLoaded = false;
    let progressOnlyLoaded = false;
    let timerInterval = null;
    let timerRemaining = 180;

    const pageTitles = {
      dashboard: 'Dashboard Intervensi',
      modules: 'Modul Pembelajaran',
      exercise: 'Guide Exercise',
      progress: 'Progress Tracking',
      reminder: 'Reminder',
      journal: 'Jurnal Refleksi',
      profile: 'Profil Siswa'
    };

    const pageSubtitles = {
      dashboard: 'Pantau aktivitas intervensi self-compassion dan lanjutkan modul yang sedang berjalan.',
      modules: 'Materi self-compassion bisa berupa artikel, latihan, audio, dan video.',
      exercise: 'Latihan refleksi, mindfulness, dan self-compassion statement untuk mendukung intervensi.',
      progress: 'Pantau progress modul, aktivitas, dan jurnal siswa secara real-time dari Google Sheet.',
      reminder: 'Buat pesan pengingat agar intervensi dilakukan secara berkelanjutan.',
      journal: 'Simpan refleksi siswa berdasarkan ID user, kode responden, mood, dan waktu pengisian.'
    };

    const statements = [
      'Tidak apa-apa merasa belum siap. Kamu sedang belajar, bukan sedang dituntut sempurna.',
      'Rasa cemas ini valid, tetapi kamu tetap bisa mengambil satu langkah kecil hari ini.',
      'Gagal memahami materi bukan berarti gagal sebagai pribadi.',
      'Aku boleh lelah, aku boleh istirahat, dan aku bisa mulai lagi dengan lebih pelan.',
      'Aku sedang berusaha menghadapi hal yang sulit, dan usaha kecilku tetap berarti.',
      'Aku tidak sendirian. Banyak siswa juga merasa takut, dan itu manusiawi.'
    ];

    document.addEventListener('DOMContentLoaded', function() {
      document.querySelectorAll('.toggle-password').forEach(function(button) {
        button.innerHTML = ICON_EYE;
      });

      const savedUser = localStorage.getItem('lms_current_user');

      if (savedUser) {
        try {
          currentUser = JSON.parse(savedUser);
          showDashboard(currentUser);
        } catch (error) {
          localStorage.removeItem('lms_current_user');
          resetToLoginPage();
        }
      } else {
        resetToLoginPage();
      }
    });

    function resetToLoginPage() {
      currentUser = null;
      document.getElementById('dashboardPage').classList.remove('active');
      document.getElementById('authPage').style.display = 'flex';
      switchForm('login');
    }

    function switchForm(type) {
      clearAlert();

      const authTabs = document.getElementById('authTabs');
      const loginTab = document.getElementById('loginTab');
      const registerTab = document.getElementById('registerTab');
      const loginForm = document.getElementById('loginForm');
      const registerForm = document.getElementById('registerForm');
      const verifyForm = document.getElementById('verifyForm');

      loginForm.classList.remove('active');
      registerForm.classList.remove('active');
      verifyForm.classList.remove('active');

      if (type === 'login') {
        authTabs.style.display = 'grid';
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.classList.add('active');
      } else if (type === 'register') {
        authTabs.style.display = 'grid';
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        registerForm.classList.add('active');
      } else if (type === 'verify') {
        authTabs.style.display = 'none';
        loginTab.classList.remove('active');
        registerTab.classList.remove('active');
        verifyForm.classList.add('active');
      }
    }

    function handleLogin(event) {
      event.preventDefault();
      clearAlert();

      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      setLoading('loginBtn', true, 'Memproses...');

      google.script.run
        .withSuccessHandler(function(response) {
          setLoading('loginBtn', false, 'Masuk ke Dashboard');

          if (!response.success) {
            if (response.requiresVerification) {
              document.getElementById('verifyEmail').value = response.email || email;
              switchForm('verify');
              showAlert(response.message, 'info');
              return;
            }

            showAlert(response.message, 'error');
            return;
          }

          localStorage.setItem('lms_current_user', JSON.stringify(response.user));
          showDashboard(response.user);
        })
        .withFailureHandler(function(error) {
          setLoading('loginBtn', false, 'Masuk ke Dashboard');
          showAlert('Gagal masuk: ' + error.message, 'error');
        })
        .loginUser({
          email: email,
          password: password
        });
    }

    function handleRegister(event) {
      event.preventDefault();
      clearAlert();

      const nama = document.getElementById('registerNama').value.trim();
      const email = document.getElementById('registerEmail').value.trim();
      const kelas = document.getElementById('registerKelas').value;
      const sekolah = document.getElementById('registerSekolah').value.trim();
      const password = document.getElementById('registerPassword').value;
      const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

      if (password !== passwordConfirm) {
        showAlert('Konfirmasi password belum sama.', 'error');
        return;
      }

      setLoading('registerBtn', true, 'Mengirim OTP...');

      google.script.run
        .withSuccessHandler(function(response) {
          setLoading('registerBtn', false, 'Daftar & Kirim OTP');

          if (!response.success) {
            showAlert(response.message, 'error');
            return;
          }

          document.getElementById('registerForm').reset();
          document.getElementById('verifyEmail').value = response.email || email;
          switchForm('verify');
          showAlert(response.message, 'info');
        })
        .withFailureHandler(function(error) {
          setLoading('registerBtn', false, 'Daftar & Kirim OTP');
          showAlert('Gagal daftar atau mengirim OTP: ' + error.message, 'error');
        })
        .registerUser({
          nama: nama,
          email: email,
          kelas: kelas,
          sekolah: sekolah,
          password: password
        });
    }

    function handleVerifyOtp(event) {
      event.preventDefault();
      clearAlert();

      const email = document.getElementById('verifyEmail').value.trim();
      const otp = document.getElementById('verifyOtp').value.trim();

      setLoading('verifyBtn', true, 'Memverifikasi...');

      google.script.run
        .withSuccessHandler(function(response) {
          setLoading('verifyBtn', false, 'Verifikasi Email');

          if (!response.success) {
            showAlert(response.message, response.expired ? 'info' : 'error');
            return;
          }

          document.getElementById('verifyOtp').value = '';
          switchForm('login');
          document.getElementById('loginEmail').value = email;
          document.getElementById('loginPassword').focus();
          showAlert(response.message, 'success');
        })
        .withFailureHandler(function(error) {
          setLoading('verifyBtn', false, 'Verifikasi Email');
          showAlert('Gagal verifikasi OTP: ' + error.message, 'error');
        })
        .verifyOtp({
          email: email,
          otp: otp
        });
    }

    function handleResendOtp() {
      clearAlert();

      const email = document.getElementById('verifyEmail').value.trim();

      if (!email) {
        showAlert('Email belum tersedia.', 'error');
        return;
      }

      setLoading('resendBtn', true, 'Mengirim ulang...');

      google.script.run
        .withSuccessHandler(function(response) {
          setLoading('resendBtn', false, 'Kirim Ulang OTP');

          if (!response.success) {
            showAlert(response.message, 'error');
            return;
          }

          showAlert(response.message, 'success');
        })
        .withFailureHandler(function(error) {
          setLoading('resendBtn', false, 'Kirim Ulang OTP');
          showAlert('Gagal mengirim ulang OTP: ' + error.message, 'error');
        })
        .resendOtp({
          email: email
        });
    }

    function showDashboard(user) {
      currentUser = user;

      document.getElementById('authPage').style.display = 'none';
      document.getElementById('dashboardPage').classList.add('active');

      const firstName = getFirstName(user.nama);

      document.getElementById('dashboardTitle').textContent = 'Dashboard Intervensi';
      document.getElementById('welcomeName').textContent = 'Selamat datang, ' + firstName + '. Kamu sudah masuk ke LMS Self-Compassion.';
      document.getElementById('sidebarKode').textContent = user.kodeResponden || '-';
      document.getElementById('sidebarEmail').textContent = user.email || '-';
      document.getElementById('topbarClass').textContent = 'Kelas ' + (user.kelas || 'XI');
      renderProfilePage();

      openPageByName('dashboard');
      loadStudentDashboardData();
    }

    function updateDashboardNextAction() {
      const title = document.getElementById('dashboardNextTitle');
      const text = document.getElementById('dashboardNextText');

      if (!title || !text || !dashboardCache || !dashboardCache.modules) {
        return;
      }

      const runningModule = dashboardCache.modules.find(function(module) {
        return module.status === 'BERJALAN';
      });

      if (runningModule) {
        const nextLesson = (runningModule.lessons || []).find(function(lesson) {
          return !lesson.completed;
        });

        title.textContent = 'Lanjutkan: ' + runningModule.judul;
        text.textContent = nextLesson
          ? 'Aktivitas berikutnya: ' + nextLesson.judul + '.'
          : 'Semua aktivitas modul ini sudah selesai.';
        return;
      }

      const lockedModule = dashboardCache.modules.find(function(module) {
        return module.status === 'TERKUNCI';
      });

      if (lockedModule) {
        title.textContent = 'Modul berikutnya masih terkunci';
        text.textContent = 'Selesaikan modul berjalan agar modul berikutnya terbuka.';
      } else {
        title.textContent = 'Program selesai';
        text.textContent = 'Kamu sudah menyelesaikan semua modul. Pertahankan kebiasaan refleksi.';
      }
    }

    function openNextRunningModule() {
      if (!dashboardCache || !dashboardCache.modules) {
        openPageByName('modules');
        return;
      }

      const runningModule = dashboardCache.modules.find(function(module) {
        return module.status === 'BERJALAN';
      });

      if (runningModule) {
        openModule(runningModule.moduleId);
        return;
      }

      openPageByName('modules');
    }

    function renderProfilePage() {
      if (!currentUser) {
        return;
      }

      const nama = currentUser.nama || 'Siswa';
      const initials = nama
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(function(part) { return part.charAt(0).toUpperCase(); })
        .join('') || 'SC';

      const avatar = document.getElementById('profileAvatar');
      const displayName = document.getElementById('profileDisplayName');
      const displayMeta = document.getElementById('profileDisplayMeta');

      if (avatar) avatar.textContent = initials;
      if (displayName) displayName.textContent = nama;
      if (displayMeta) {
        displayMeta.textContent = (currentUser.kodeResponden || '-') + ' · ' + (currentUser.email || '-');
      }

      const topbarAvatar = document.getElementById('topbarAvatar');
      const topbarName = document.getElementById('topbarProfileName');
      const topbarCode = document.getElementById('topbarProfileCode');

      if (topbarAvatar) topbarAvatar.textContent = initials;
      if (topbarName) topbarName.textContent = nama;
      if (topbarCode) topbarCode.textContent = currentUser.kodeResponden || 'Kode Responden';

      if (document.getElementById('profileNama')) {
        document.getElementById('profileNama').value = currentUser.nama || '';
        document.getElementById('profileEmail').textContent = currentUser.email || '-';
        document.getElementById('profileKode').textContent = currentUser.kodeResponden || '-';
        document.getElementById('profileKelas').value = currentUser.kelas || 'XI';
        document.getElementById('profileSekolah').value = currentUser.sekolah || '';
      }
    }

    function saveProfile() {
      if (!currentUser) {
        showAppAlert('Silakan login ulang.', 'error');
        return;
      }

      const nama = document.getElementById('profileNama').value.trim();
      const kelas = document.getElementById('profileKelas').value;
      const sekolah = document.getElementById('profileSekolah').value.trim();

      if (!nama) {
        showAppAlert('Nama tidak boleh kosong.', 'error');
        return;
      }

      setLoading('saveProfileBtn', true, 'Menyimpan...');

      google.script.run
        .withSuccessHandler(function(response) {
          setLoading('saveProfileBtn', false, 'Simpan Profil');

          if (!response.success) {
            showAppAlert(response.message, 'error');
            return;
          }

          currentUser = response.user;
          localStorage.setItem('lms_current_user', JSON.stringify(currentUser));
          document.getElementById('sidebarKode').textContent = currentUser.kodeResponden || '-';
          document.getElementById('sidebarEmail').textContent = currentUser.email || '-';
          document.getElementById('topbarClass').textContent = 'Kelas ' + (currentUser.kelas || 'XI');
          document.getElementById('welcomeName').textContent = 'Halo, ' + (currentUser.nama || 'Siswa') + '.';
          renderProfilePage();
          showAppAlert(response.message, 'success');
        })
        .withFailureHandler(function(error) {
          setLoading('saveProfileBtn', false, 'Simpan Profil');
          showAppAlert('Gagal menyimpan profil: ' + error.message, 'error');
        })
        .updateStudentProfilePatch({
          user: currentUser,
          nama: nama,
          kelas: kelas,
          sekolah: sekolah
        });
    }

    function changePassword() {
      if (!currentUser) {
        showAppAlert('Silakan login ulang.', 'error');
        return;
      }

      const oldPassword = document.getElementById('oldPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (!oldPassword || !newPassword || !confirmPassword) {
        showAppAlert('Semua kolom password wajib diisi.', 'error');
        return;
      }

      if (newPassword.length < 6) {
        showAppAlert('Password baru minimal 6 karakter.', 'error');
        return;
      }

      if (newPassword !== confirmPassword) {
        showAppAlert('Konfirmasi password baru tidak sama.', 'error');
        return;
      }

      setLoading('changePasswordBtn', true, 'Mengganti...');

      google.script.run
        .withSuccessHandler(function(response) {
          setLoading('changePasswordBtn', false, 'Ganti Password');

          if (!response.success) {
            showAppAlert(response.message, 'error');
            return;
          }

          document.getElementById('oldPassword').value = '';
          document.getElementById('newPassword').value = '';
          document.getElementById('confirmPassword').value = '';
          showAppAlert(response.message, 'success');
        })
        .withFailureHandler(function(error) {
          setLoading('changePasswordBtn', false, 'Ganti Password');
          showAppAlert('Gagal mengganti password: ' + error.message, 'error');
        })
        .changeStudentPasswordPatch({
          user: currentUser,
          oldPassword: oldPassword,
          newPassword: newPassword
        });
    }

    function openPage(page, button) {
      document.querySelectorAll('.page-section').forEach(function(section) {
        section.classList.remove('active');
      });

      document.getElementById('page-' + page).classList.add('active');

      document.querySelectorAll('.nav-item').forEach(function(item) {
        item.classList.remove('active');
      });

      if (button) {
        button.classList.add('active');
      }

      document.getElementById('dashboardTitle').textContent = pageTitles[page] || 'Dashboard';
      document.getElementById('pageSubtitle').textContent = pageSubtitles[page] || '';

      clearAppAlert();
      closeMobileSidebar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function openPageByName(page) {
      const button = document.querySelector('.nav-item[data-page="' + page + '"]');
      openPage(page, button);
    }

    function openMobileSidebar() {
      document.getElementById('sidebar').classList.add('mobile-open');
      document.getElementById('mobileOverlay').classList.add('active');
    }

    function closeMobileSidebar() {
      document.getElementById('sidebar').classList.remove('mobile-open');
      document.getElementById('mobileOverlay').classList.remove('active');
    }

    function loadStudentDashboardData() {
      if (!currentUser) {
        showAppAlert('Sesi siswa tidak valid. Silakan keluar lalu login ulang.', 'error');
        return;
      }

      progressOnlyLoaded = false;
      loadModulesForPage();
    }

    function loadModulesForPage() {
      google.script.run
        .withSuccessHandler(function(response) {
          if (!response || !response.success) {
            const msg = response && response.message ? response.message : 'Katalog modul belum bisa dimuat.';
            setModuleLoadingError(msg);
            return;
          }

          dashboardCache = response;
          renderProgress(response.stats);
          renderModules(response.modules);
          renderDashboardModules(response.modules);
          renderTimeline(response);
          renderReminderPage(response.reminders);
          renderProgressPage(response);
          renderRecentJournals(response.recentJournals || []);

          loadProgressOnlyData();
        })
        .withFailureHandler(function(error) {
          setModuleLoadingError('Gagal memuat katalog modul: ' + error.message);
        })
        .getModulesForPage();
    }

    function loadProgressOnlyData() {
      if (!currentUser || (!currentUser.kodeResponden && !currentUser.idUser)) {
        showAppAlert('Sesi progress belum lengkap. Silakan logout lalu login ulang.', 'error');
        return;
      }

      google.script.run
        .withSuccessHandler(function(response) {
          if (!response || !response.success) {
            showAppAlert(response && response.message ? response.message : 'Progress personal belum bisa dibaca.', 'error');
            return;
          }

          progressOnlyLoaded = true;
          applyProgressOnlyToDashboard(response.completedLessonIds || []);
        })
        .withFailureHandler(function(error) {
          showAppAlert('Gagal membaca progress personal: ' + error.message, 'error');
        })
        .getProgressOnlyByIdentityPatch(currentUser.kodeResponden || '', currentUser.idUser || '');
    }

    function applyProgressOnlyToDashboard(completedLessonIds) {
      if (!dashboardCache || !dashboardCache.modules) {
        return;
      }

      const completedMap = {};
      (completedLessonIds || []).forEach(function(lessonId) {
        completedMap[String(lessonId || '').trim()] = true;
      });

      dashboardCache.modules = dashboardCache.modules.map(function(module, index) {
        const lessons = (module.lessons || []).map(function(lesson) {
          const completed = completedMap[String(lesson.lessonId || '').trim()] === true;
          lesson.completed = completed;
          return lesson;
        });

        const totalLessons = lessons.length;
        const completedLessons = lessons.filter(function(lesson) {
          return lesson.completed === true;
        }).length;

        const percentage = totalLessons > 0
          ? Math.round((completedLessons / totalLessons) * 100)
          : 0;

        let status = 'TERKUNCI';

        if (index === 0 || percentage > 0 || isPreviousModuleDoneClient(index, dashboardCache.modules, completedMap)) {
          status = percentage >= 100 && totalLessons > 0 ? 'SELESAI' : 'BERJALAN';
        }

        module.lessons = lessons;
        module.totalLessons = totalLessons;
        module.completedLessons = completedLessons;
        module.percentage = percentage;
        module.status = status;

        return module;
      });

      const totalLessons = dashboardCache.modules.reduce(function(sum, module) {
        return sum + Number(module.totalLessons || 0);
      }, 0);

      const completedLessons = dashboardCache.modules.reduce(function(sum, module) {
        return sum + Number(module.completedLessons || 0);
      }, 0);

      const totalModules = dashboardCache.modules.length;
      const completedModules = dashboardCache.modules.filter(function(module) {
        return module.status === 'SELESAI';
      }).length;

      dashboardCache.stats = {
        totalModules: totalModules,
        completedModules: completedModules,
        totalLessons: totalLessons,
        completedLessons: completedLessons,
        totalJournals: dashboardCache.stats ? dashboardCache.stats.totalJournals || 0 : 0,
        overallProgress: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
      };

      renderProgress(dashboardCache.stats);
      renderModules(dashboardCache.modules);
      renderDashboardModules(dashboardCache.modules);
      renderProgressPage(dashboardCache);

      if (selectedModule) {
        const updatedSelected = dashboardCache.modules.find(function(module) {
          return module.moduleId === selectedModule.moduleId;
        });

        if (updatedSelected) {
          selectedModule = updatedSelected;
          renderPremiumModuleModal();
        }
      }
    }

    function isPreviousModuleDoneClient(index, modules, completedMap) {
      if (index <= 0) {
        return true;
      }

      const previous = modules[index - 1];

      if (!previous || !previous.lessons || previous.lessons.length === 0) {
        return false;
      }

      return previous.lessons.every(function(lesson) {
        return completedMap[String(lesson.lessonId || '').trim()] === true;
      });
    }

    function setModuleLoadingError(message) {
      const targetIds = ['moduleList', 'dashboardModuleList', 'progressModuleList'];

      targetIds.forEach(function(id) {
        const el = document.getElementById(id);
        if (el) {
          el.innerHTML = '<div class="list-item"><strong>Modul belum bisa dimuat</strong><span>' + escapeClientHtml(message || 'Terjadi kendala saat mengambil data modul.') + '</span><p style="margin-top:8px;color:#374151;font-size:13px;line-height:1.6;">Jalankan fungsi <b>testModulesForPage()</b> di Apps Script editor lalu kirim hasilnya.</p></div>';
        }
      });
    }

    function renderProgress(stats) {
      const percent = Number(stats.overallProgress || 0);
      const name = currentUser && currentUser.nama ? currentUser.nama : 'Siswa';
      const firstName = name.split(' ')[0] || 'Siswa';

      document.getElementById('overallProgressText').textContent = percent + '%';
      document.getElementById('progressRing').style.background =
        'conic-gradient(var(--primary) ' + percent + '%, #E5E7EB 0)';

      let progressMessage = '';
      let encouragement = '';

      if (percent >= 100) {
        progressMessage = 'Hebat, ' + firstName + '. Kamu sudah menyelesaikan seluruh aktivitas intervensi self-compassion.';
        encouragement = 'Gunakan menu jurnal untuk menjaga kebiasaan refleksi dan self-kindness.';
      } else if (percent >= 60) {
        progressMessage = firstName + ', progress intervensimu sudah ' + percent + '%. Kamu semakin dekat menyelesaikan program.';
        encouragement = 'Lanjutkan aktivitas yang sedang berjalan agar ritme belajarmu tetap stabil.';
      } else if (percent > 0) {
        progressMessage = firstName + ', kamu sudah menyelesaikan ' + stats.completedLessons + ' dari ' + stats.totalLessons + ' aktivitas.';
        encouragement = 'Ambil satu langkah kecil lagi hari ini. Tidak perlu sempurna, yang penting berproses.';
      } else {
        progressMessage = firstName + ', kamu belum memulai aktivitas. Mulai dari modul pertama dengan pelan dan sadar.';
        encouragement = 'Mulai dari satu aktivitas singkat untuk mengenali tekanan akademikmu.';
      }

      document.getElementById('progressSummary').textContent =
        progressMessage + ' Jurnal tersimpan: ' + stats.totalJournals + '.';

      const personalMessage = document.getElementById('dashboardPersonalMessage');
      if (personalMessage) {
        personalMessage.textContent = encouragement;
      }

      document.getElementById('statTotalModules').textContent = stats.totalModules;
      document.getElementById('statCompletedLessons').textContent = stats.completedLessons + '/' + stats.totalLessons;
      document.getElementById('statCompletedModules').textContent = stats.completedModules + '/' + stats.totalModules;
      document.getElementById('statTotalJournals').textContent = stats.totalJournals;

      updateDashboardNextAction();
      renderProfilePage();
    }

    function renderModules(modules) {
      const moduleList = document.getElementById('moduleList');

      if (!modules || modules.length === 0) {
        moduleList.innerHTML = '<p class="empty-state">Modul belum tersedia.</p>';
        return;
      }

      moduleList.innerHTML = modules.map(moduleCardHtml).join('');
    }

    function renderDashboardModules(modules) {
      const dashboardModuleList = document.getElementById('dashboardModuleList');

      if (!modules || modules.length === 0) {
        dashboardModuleList.innerHTML = '<p class="empty-state">Modul belum tersedia.</p>';
        return;
      }

      const running = modules.filter(function(module) {
        return module.status === 'BERJALAN';
      });

      const completed = modules.filter(function(module) {
        return module.status === 'SELESAI';
      }).slice(-1);

      const recommended = running.length ? running : (completed.length ? completed : modules.slice(0, 1));

      dashboardModuleList.innerHTML = recommended.slice(0, 3).map(moduleCardHtml).join('');
    }

    function moduleCardHtml(module) {
      let badgeClass = 'status-locked';
      let label = '🔒 Terkunci';
      let cardClass = 'locked-card';
      let buttonHtml = `<button type="button" class="btn-outline btn-locked" style="margin-top:10px;" disabled><span class="lock-symbol">🔒</span>Terkunci</button>`;

      if (module.status === 'SELESAI') {
        badgeClass = 'status-done';
        label = 'Selesai';
        cardClass = '';
        buttonHtml = `<button type="button" class="btn-outline" style="margin-top:10px;" onclick="openModule('${module.moduleId}')">Lihat Modul</button>`;
      } else if (module.status === 'BERJALAN') {
        badgeClass = 'status-progress';
        label = 'Berjalan';
        cardClass = '';
        buttonHtml = `<button type="button" class="btn-outline" style="margin-top:10px;" onclick="openModule('${module.moduleId}')">Buka Modul</button>`;
      }

      const number = String(module.urutan).padStart(2, '0');

      return `
        <div class="module-item ${cardClass}">
          <div class="module-number">${number}</div>
          <div>
            <h4>${escapeClientHtml(module.judul)}</h4>
            <p>${escapeClientHtml(module.deskripsi)}</p>
            <p style="margin-top:6px;">Progress: ${module.percentage}% · ${module.completedLessons}/${module.totalLessons} aktivitas</p>
            ${buttonHtml}
          </div>
          <span class="status-badge ${badgeClass}">${label}</span>
        </div>
      `;
    }

    function renderTimeline(response) {
      const timeline = document.getElementById('dashboardReminderList');
      const reminders = response.reminders || [];

      if (reminders.length > 0) {
        timeline.innerHTML = reminders.slice(0, 4).map(function(reminder, index) {
          return `
            <div class="timeline-item">
              <div class="timeline-dot">${index + 1}</div>
              <div class="timeline-content">
                <h4>${escapeClientHtml(reminder.title)}</h4>
                <p>${escapeClientHtml(reminder.message)}</p>
              </div>
            </div>
          `;
        }).join('');
        return;
      }

      timeline.innerHTML = defaultReminderHtml();
    }

    function defaultReminderHtml() {
      return `
        <div class="timeline-item">
          <div class="timeline-dot">1</div>
          <div class="timeline-content">
            <h4>Mulai Modul</h4>
            <p>Baca modul pertama tentang tekanan akademik dan persiapan ujian masuk PTN.</p>
          </div>
        </div>
        <div class="timeline-item">
          <div class="timeline-dot">2</div>
          <div class="timeline-content">
            <h4>Tulis Refleksi</h4>
            <p>Catat perasaanmu hari ini secara jujur dan aman.</p>
          </div>
        </div>
        <div class="timeline-item">
          <div class="timeline-dot">3</div>
          <div class="timeline-content">
            <h4>Ambil Jeda</h4>
            <p>Luangkan 3 menit untuk bernapas dan menyadari emosi tanpa menghakimi diri.</p>
          </div>
        </div>
      `;
    }

    function renderProgressPage(response) {
      const stats = response.stats;

      document.getElementById('progressPageOverall').textContent = stats.overallProgress + '%';
      document.getElementById('progressPageModules').textContent = stats.completedModules + '/' + stats.totalModules;
      document.getElementById('progressPageLessons').textContent = stats.completedLessons + '/' + stats.totalLessons;
      document.getElementById('progressPageJournals').textContent = stats.totalJournals;

      const progressModuleList = document.getElementById('progressModuleList');

      if (!response.modules || response.modules.length === 0) {
        progressModuleList.innerHTML = '<p class="empty-state">Belum ada data progress modul.</p>';
        return;
      }

      progressModuleList.innerHTML = response.modules.map(function(module) {
        return `
          <div class="list-item">
            <strong>${String(module.urutan).padStart(2, '0')}. ${escapeClientHtml(module.judul)}</strong>
            <span>Status: ${module.status} · Progress: ${module.percentage}% · ${module.completedLessons}/${module.totalLessons} aktivitas selesai</span>
          </div>
        `;
      }).join('');
    }

    function renderReminderPage(reminders) {
      const reminderList = document.getElementById('reminderList');

      if (!reminders || reminders.length === 0) {
        reminderList.innerHTML = defaultReminderHtml();
        return;
      }

      reminderList.innerHTML = reminders.map(function(reminder, index) {
        return `
          <div class="timeline-item">
            <div class="timeline-dot">${index + 1}</div>
            <div class="timeline-content">
              <h4>${escapeClientHtml(reminder.title)}</h4>
              <p>${escapeClientHtml(reminder.message)}</p>
              <button class="btn-outline" style="margin-top:10px;" onclick="disableUserReminder('${reminder.reminderId}')">Nonaktifkan</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderRecentJournals(journals) {
      const recentJournalList = document.getElementById('recentJournalList');

      if (!journals || journals.length === 0) {
        recentJournalList.innerHTML = '<p class="empty-state">Belum ada jurnal yang tersimpan.</p>';
        return;
      }

      recentJournalList.innerHTML = journals.map(function(journal) {
        return `
          <div class="list-item">
            <strong>${escapeClientHtml(journal.pertanyaan || 'Refleksi')}</strong>
            <span>Mood: ${escapeClientHtml(journal.mood || '-')}</span>
            <p style="margin-top:8px;color:#374151;font-size:13px;line-height:1.6;">${escapeClientHtml(journal.jawaban || '')}</p>
          </div>
        `;
      }).join('');
    }

    function openModule(moduleId) {
      if (!dashboardCache || !dashboardCache.modules) {
        return;
      }

      selectedModule = dashboardCache.modules.find(function(module) {
        return module.moduleId === moduleId;
      });

      if (!selectedModule) {
        showAppAlert('Modul tidak ditemukan.', 'info');
        return;
      }

      if (selectedModule.status === 'TERKUNCI') {
        showAppAlert('Modul ini masih terkunci. Selesaikan modul yang sedang berjalan terlebih dahulu.', 'info');
        selectedModule = null;
        return;
      }

      renderPremiumModuleModal();
      document.getElementById('lessonModal').classList.add('active');
    }

    function renderPremiumModuleModal() {
      if (!selectedModule) {
        return;
      }

      document.getElementById('lessonModalTitle').textContent = selectedModule.judul;
      document.getElementById('lessonModalDesc').textContent = selectedModule.deskripsi;
      document.getElementById('lessonModalPill').textContent =
        'Modul ' + String(selectedModule.urutan).padStart(2, '0') + ' · ' + selectedModule.status;

      document.getElementById('lessonModalProgressText').textContent = 'Progress: ' + selectedModule.percentage + '%';
      document.getElementById('lessonModalActivityText').textContent =
        selectedModule.completedLessons + '/' + selectedModule.totalLessons + ' aktivitas selesai';
      document.getElementById('lessonModalProgressFill').style.width = selectedModule.percentage + '%';

      const lessonModalList = document.getElementById('lessonModalList');

      if (!selectedModule.lessons || selectedModule.lessons.length === 0) {
        lessonModalList.innerHTML = '<p class="empty-state">Belum ada materi dalam modul ini.</p>';
      } else {
        lessonModalList.innerHTML = selectedModule.lessons.map(function(lesson) {
          const statusText = lesson.completed ? 'Selesai' : 'Belum selesai';
          const statusClass = lesson.completed ? 'done' : 'progress';
          const cardClass = lesson.completed ? 'done' : '';
          const embedUrl = getVideoEmbedUrl(lesson.videoUrl);
          const videoHtml = embedUrl
            ? `
              <div class="premium-video-frame">
                <div class="premium-video-ratio">
                  <iframe src="${embedUrl}" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
                </div>
              </div>
            `
            : '';

          return `
            <div class="premium-lesson-card ${cardClass}">
              <div class="premium-lesson-number">${lesson.completed ? '✓' : String(lesson.urutan).padStart(2, '0')}</div>
              <div class="premium-lesson-main">
                <strong>${escapeClientHtml(lesson.judul)}</strong>
                ${videoHtml}
                <p>${escapeClientHtml(lesson.konten)}</p>
                <div class="premium-lesson-meta">
                  <span class="premium-meta-pill ${statusClass}">${lesson.completed ? '✓' : '•'} ${statusText}</span>
                  <span class="premium-meta-pill">${escapeClientHtml(lesson.tipeKonten)}</span>
                  <span class="premium-meta-pill">${lesson.durasiMenit || 0} menit</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      const nextLesson = getFirstIncompleteLesson(selectedModule);
      const completeButton = document.getElementById('completeFirstLessonBtn');

      if (selectedModule.status !== 'BERJALAN') {
        completeButton.disabled = true;
        completeButton.textContent = selectedModule.status === 'SELESAI' ? 'Selesai' : 'Terkunci';
      } else {
        completeButton.disabled = !nextLesson;
        completeButton.textContent = 'Selesai';
      }
    }

    function closeLessonModal() {
      document.getElementById('lessonModal').classList.remove('active');
      selectedModule = null;
    }


    function buildLessonVideoFrame(lesson, embedUrl, sourceLabel) {
      const type = String(lesson.tipeKonten || '').toUpperCase();
      const shouldShowFrame = embedUrl || type.indexOf('VIDEO') !== -1;

      if (!shouldShowFrame) {
        return '';
      }

      const title = escapeClientHtml(lesson.judul || 'Video Pembelajaran');
      const duration = lesson.durasiMenit ? escapeClientHtml(lesson.durasiMenit) + ' menit' : 'Durasi menyesuaikan video';
      const pill = sourceLabel ? escapeClientHtml(sourceLabel) : 'Video';

      if (embedUrl) {
        return `
          <div class="module-video-frame">
            <div class="module-video-ratio">
              <iframe src="${embedUrl}" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
            </div>
            <div class="module-video-caption">
              <div>
                <strong>${title}</strong>
                <span>Materi video pembelajaran · ${duration}</span>
              </div>
              <div class="video-source-pill">${pill}</div>
            </div>
          </div>
        `;
      }

      return `
        <div class="module-video-frame">
          <div class="module-video-ratio">
            <div class="module-video-placeholder">
              <div class="play-circle">
                <svg class="icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
              </div>
              <strong>Video Pembelajaran</strong>
              <span>Video untuk materi ini belum tersedia.</span>
            </div>
          </div>
          <div class="module-video-caption">
            <div>
              <strong>${title}</strong>
              <span>Materi video · ${duration}</span>
            </div>
            <div class="video-source-pill">Video</div>
          </div>
        </div>
      `;
    }

    function getVideoSourceLabel(url) {
      const cleanUrl = String(url || '').trim();

      if (!cleanUrl) {
        return '';
      }

      if (cleanUrl.indexOf('youtu') !== -1) {
        return 'YouTube';
      }

      if (cleanUrl.indexOf('drive.google.com') !== -1) {
        return 'Google Drive';
      }

      return 'Video';
    }

    function getVideoEmbedUrl(url) {
      const cleanUrl = String(url || '').trim();

      if (!cleanUrl) {
        return '';
      }

      let match = cleanUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/);

      if (match && match[1]) {
        return 'https://www.youtube.com/embed/' + match[1];
      }

      match = cleanUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);

      if (match && match[1]) {
        return 'https://drive.google.com/file/d/' + match[1] + '/preview';
      }

      if (cleanUrl.indexOf('https://') === 0) {
        return cleanUrl;
      }

      return '';
    }

    function getFirstIncompleteLesson(module) {
      if (!module || !module.lessons) {
        return null;
      }

      return module.lessons.find(function(lesson) {
        return !lesson.completed;
      }) || null;
    }

    function completeFirstAvailableLesson() {
      if (!currentUser || !selectedModule) {
        showAppAlert('Data belum lengkap.', 'error');
        return;
      }

      if (selectedModule.status !== 'BERJALAN') {
        showAppAlert('Progress hanya bisa diselesaikan pada modul yang sedang berjalan.', 'info');
        return;
      }

      const lesson = getFirstIncompleteLesson(selectedModule);

      if (!lesson) {
        showAppAlert('Semua aktivitas dalam modul ini sudah selesai.', 'success');
        return;
      }

      setLoading('completeFirstLessonBtn', true, 'Menyimpan...');

      google.script.run
        .withSuccessHandler(function(response) {
          setLoading('completeFirstLessonBtn', false, 'Selesai');

          if (!response.success) {
            showAppAlert(response.message, 'error');
            return;
          }

          closeLessonModal();
          showAppAlert(response.message, 'success');

          if (response.progress && response.progress.success) {
            applyProgressOnlyToDashboard(response.progress.completedLessonIds || []);
            return;
          }

          if (response.dashboard && response.dashboard.success) {
            personalDashboardLoaded = true;
            dashboardCache = response.dashboard;

            if (response.dashboard.user) {
              currentUser = response.dashboard.user;
              localStorage.setItem('lms_current_user', JSON.stringify(response.dashboard.user));
              document.getElementById('sidebarKode').textContent = response.dashboard.user.kodeResponden || '-';
              document.getElementById('sidebarEmail').textContent = response.dashboard.user.email || '-';
              document.getElementById('topbarClass').textContent = 'Kelas ' + (response.dashboard.user.kelas || 'XI');
              document.getElementById('welcomeName').textContent = 'Halo, ' + (response.dashboard.user.nama || 'Siswa') + '.';
              renderProfilePage();
            }

            renderProgress(response.dashboard.stats);
            renderModules(response.dashboard.modules);
            renderDashboardModules(response.dashboard.modules);
            renderTimeline(response.dashboard);
            renderReminderPage(response.dashboard.reminders);
            renderProgressPage(response.dashboard);
            renderRecentJournals(response.dashboard.recentJournals || []);
          } else {
            loadStudentDashboardData();
          }
        })
        .withFailureHandler(function(error) {
          setLoading('completeFirstLessonBtn', false, 'Selesai');
          showAppAlert('Gagal menyimpan progress: ' + error.message, 'error');
        })
        .saveProgressOnlyByIdentityPatch(currentUser.kodeResponden || '', currentUser.idUser || '', currentUser.email || '', selectedModule.moduleId, lesson.lessonId);
    }

    function saveReflectionJournal() {
      if (!currentUser) {
        showAppAlert('Silakan login ulang.', 'error');
        return;
      }

      const textarea = document.getElementById('journalInput');
      const mood = document.getElementById('journalMood').value;
      const jawaban = textarea.value.trim();

      if (!jawaban) {
        showAppAlert('Jurnal refleksi belum boleh kosong.', 'error');
        return;
      }

      setLoading('saveJournalBtn', true, 'Menyimpan...');

      google.script.run
        .withSuccessHandler(function(response) {
          setLoading('saveJournalBtn', false, 'Simpan Refleksi');

          if (!response.success) {
            showAppAlert(response.message, 'error');
            return;
          }

          textarea.value = '';
          document.getElementById('journalMood').value = '';
          showAppAlert(response.message, 'success');
          loadStudentDashboardData();
        })
        .withFailureHandler(function(error) {
          setLoading('saveJournalBtn', false, 'Simpan Refleksi');
          showAppAlert('Gagal menyimpan jurnal: ' + error.message, 'error');
        })
        .saveJournalReflection({
          user: currentUser,
          moduleId: 'MOD-001',
          lessonId: '',
          exerciseId: '',
          tipeJurnal: 'SELF_REFLECTION',
          pertanyaan: 'Apa yang kamu rasakan hari ini?',
          jawaban: jawaban,
          mood: mood
        });
    }

    function saveExerciseJournal() {
      if (!currentUser) {
        showAppAlert('Silakan login ulang.', 'error');
        return;
      }

      const textarea = document.getElementById('exerciseReflection');
      const mood = document.getElementById('exerciseMood').value;
      const jawaban = textarea.value.trim();

      if (!jawaban) {
        showAppAlert('Jawaban guide exercise belum boleh kosong.', 'error');
        return;
      }

      setLoading('saveExerciseBtn', true, 'Menyimpan...');

      google.script.run
        .withSuccessHandler(function(response) {
          setLoading('saveExerciseBtn', false, 'Simpan Guide Exercise');

          if (!response.success) {
            showAppAlert(response.message, 'error');
            return;
          }

          textarea.value = '';
          document.getElementById('exerciseMood').value = '';
          showAppAlert(response.message, 'success');
          loadStudentDashboardData();
        })
        .withFailureHandler(function(error) {
          setLoading('saveExerciseBtn', false, 'Simpan Guide Exercise');
          showAppAlert('Gagal menyimpan exercise: ' + error.message, 'error');
        })
        .saveExerciseReflection({
          user: currentUser,
          moduleId: 'MOD-003',
          lessonId: 'LES-005',
          exerciseId: 'EXC-001',
          tipeJurnal: 'GUIDE_EXERCISE',
          pertanyaan: 'Apa yang kamu rasakan hari ini? Apa yang ingin kamu katakan pada dirimu sendiri?',
          jawaban: jawaban,
          mood: mood
        });
    }

    function saveReminder() {
      if (!currentUser) {
        showAppAlert('Silakan login ulang.', 'error');
        return;
      }

      const judul = document.getElementById('reminderTitle').value.trim();
      const pesan = document.getElementById('reminderMessage').value.trim();
      const tipe = document.getElementById('reminderType').value;

      if (!judul || !pesan) {
        showAppAlert('Judul dan pesan reminder wajib diisi.', 'error');
        return;
      }

      setLoading('saveReminderBtn', true, 'Menyimpan...');

      google.script.run
        .withSuccessHandler(function(response) {
          setLoading('saveReminderBtn', false, 'Simpan Reminder');

          if (!response.success) {
            showAppAlert(response.message, 'error');
            return;
          }

          document.getElementById('reminderTitle').value = '';
          document.getElementById('reminderMessage').value = '';
          document.getElementById('reminderType').value = 'DAILY';

          showAppAlert(response.message, 'success');
          loadStudentDashboardData();
        })
        .withFailureHandler(function(error) {
          setLoading('saveReminderBtn', false, 'Simpan Reminder');
          showAppAlert('Gagal menyimpan reminder: ' + error.message, 'error');
        })
        .createReminder({
          user: currentUser,
          judul: judul,
          pesan: pesan,
          tipe: tipe
        });
    }

    function disableUserReminder(reminderId) {
      if (!currentUser || !reminderId) {
        showAppAlert('Data reminder belum lengkap.', 'error');
        return;
      }

      google.script.run
        .withSuccessHandler(function(response) {
          if (!response.success) {
            showAppAlert(response.message, 'error');
            return;
          }

          showAppAlert(response.message, 'success');
          loadStudentDashboardData();
        })
        .withFailureHandler(function(error) {
          showAppAlert('Gagal menonaktifkan reminder: ' + error.message, 'error');
        })
        .disableReminder({
          user: currentUser,
          reminderId: reminderId
        });
    }

    function startMindfulnessTimer() {
      if (timerInterval) {
        return;
      }

      timerInterval = setInterval(function() {
        timerRemaining--;

        if (timerRemaining <= 0) {
          clearInterval(timerInterval);
          timerInterval = null;
          timerRemaining = 0;
          updateTimerText();
          showAppAlert('Latihan mindfulness selesai. Ambil napas terakhir dan sadari perasaanmu sekarang.', 'success');
          return;
        }

        updateTimerText();
      }, 1000);
    }

    function resetMindfulnessTimer() {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }

      timerRemaining = 180;
      updateTimerText();
    }

    function updateTimerText() {
      const minutes = Math.floor(timerRemaining / 60);
      const seconds = timerRemaining % 60;
      document.getElementById('timerText').textContent =
        String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }

    function generateCompassionStatement() {
      const randomIndex = Math.floor(Math.random() * statements.length);
      document.getElementById('statementResult').textContent = statements[randomIndex];
    }

    function transformSelfCritic() {
      const input = document.getElementById('selfCriticInput').value.trim();

      if (!input) {
        document.getElementById('selfCriticResult').textContent = 'Tulis dulu kritik diri yang sering muncul.';
        return;
      }

      document.getElementById('selfCriticResult').textContent =
        'Aku sedang merasa berat karena pikiran seperti: "' +
        input +
        '". Tapi pikiran ini bukan keseluruhan diriku. Aku boleh belajar pelan-pelan, meminta bantuan, dan mencoba satu langkah kecil hari ini.';
    }

    function logoutUser() {
      localStorage.removeItem('lms_current_user');
      currentUser = null;
      dashboardCache = null;
      selectedModule = null;

      document.getElementById('dashboardPage').classList.remove('active');
      document.getElementById('authPage').style.display = 'flex';

      document.getElementById('loginPassword').value = '';
      clearAlert();
      switchForm('login');
    }

    function getFirstName(name) {
      const cleanName = String(name || 'Siswa').trim();
      return cleanName.split(' ')[0] || 'Siswa';
    }

    function togglePassword(inputId, button) {
      const input = document.getElementById(inputId);

      if (input.type === 'password') {
        input.type = 'text';
        button.innerHTML = ICON_EYE_OFF;
      } else {
        input.type = 'password';
        button.innerHTML = ICON_EYE;
      }
    }

    function showAlert(message, type) {
      const alertBox = document.getElementById('alertBox');
      alertBox.textContent = message;
      alertBox.className = 'alert show ' + type;
    }

    function clearAlert() {
      const alertBox = document.getElementById('alertBox');
      alertBox.textContent = '';
      alertBox.className = 'alert';
    }

    function showAppAlert(message, type) {
      const alertBox = document.getElementById('appAlertBox');
      alertBox.textContent = message;
      alertBox.className = 'alert show ' + type;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function clearAppAlert() {
      const alertBox = document.getElementById('appAlertBox');
      alertBox.textContent = '';
      alertBox.className = 'alert';
    }

    function setLoading(buttonId, isLoading, text) {
      const button = document.getElementById(buttonId);
      button.disabled = isLoading;
      button.textContent = text;
    }

    function escapeClientHtml(text) {
      return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  
