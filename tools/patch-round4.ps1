$ErrorActionPreference = 'Stop'
$root = 'D:\Project\FenzaRoad-RE'
$f = Join-Path $root 'src\main.ts'
$c = [System.IO.File]::ReadAllText($f)
$c = [regex]::Replace($c, "\r\n", "\n")

function Rep([string]$old, [string]$new) {
  if (-not $script:c.Contains($old)) { throw "pattern missing: $($old.Substring(0, [Math]::Min(60, $old.Length)))" }
  $script:c = $script:c.Replace($old, $new)
}

Rep "import { AudioSystem } from './audio/AudioSystem';" "import { AudioSystem } from './audio/AudioSystem';`nimport { Pedestrians } from './gameplay/Pedestrians';`nimport { Career } from './ui/Career';`nimport { achievementProgress, dailyQuests, checkInReady, nextCheckIn } from './meta/Progress';"

Rep "  readonly garage: Garage;" "  readonly garage: Garage;`n  readonly career: Career;`n  readonly peds: Pedestrians;`n  private pendingKm = 0;`n  private saveTimer = 0;"

Rep "    this.pause = new Pause(ui, {" "    this.career = new Career(ui, {`n      onClaimCheckIn: () => this.claimCheckIn(),`n      onClaimQuest: (id) => this.claimQuest(id),`n      onClose: () => this.menu?.show(),`n    });`n    this.peds = new Pedestrians(this.scene, 4, 72);`n    this.pause = new Pause(ui, {"

Rep "      onGarage: () => this.openGarage()," "      onGarage: () => this.openGarage(),`n      onCareer: () => this.openCareer(),"

Rep "    this.updateRace(frameDt);" "    this.updateRace(frameDt);`n    if (!this.paused) this.peds.update(frameDt, this.elapsed);"

Rep "    this.traffic.update(frameDt);" "    this.traffic.update(frameDt);"

Rep "    this.elapsed += frameDt;" "    this.trackProgress(frameDt);`n    this.elapsed += frameDt;"

Rep "  /** 打开车库（菜单背景保留，车辆在场景里可继续被环绕展示） */" @'
  /** 生涯屏 */
  private openCareer(): void {
    this.checkAchievements();
    this.menu?.hide();
    this.career.show(this.save.data);
  }

  private claimCheckIn(): void {
    if (!checkInReady(this.save.data)) return;
    const next = nextCheckIn(this.save.data);
    this.save.data.daily.checkInDate = new Date().toISOString().slice(0, 10);
    this.save.data.daily.checkInStreak = next.streak;
    this.save.data.coins += next.reward;
    this.save.data.stats.coinsEarned += next.reward;
    this.save.save();
    this.menu?.setCoins(this.save.data.coins);
    this.audio.playClick();
    this.checkAchievements();
    this.career.show(this.save.data);
    this.hud.toast(`签到成功 +◈${next.reward}`, 'good');
  }

  private claimQuest(id: string): void {
    const quest = dailyQuests(this.save.data).find((q) => q.id === id);
    if (!quest || !quest.done || quest.claimed) return;
    const today = new Date().toISOString().slice(0, 10);
    if (this.save.data.daily.date !== today) {
      this.save.data.daily.date = today;
      this.save.data.daily.done = [];
    }
    this.save.data.daily.done.push(id);
    this.save.data.coins += quest.reward;
    this.save.data.stats.coinsEarned += quest.reward;
    this.save.save();
    this.menu?.setCoins(this.save.data.coins);
    this.audio.playClick();
    this.career.show(this.save.data);
    this.hud.toast(`任务完成 +◈${quest.reward}`, 'good');
  }

  /** 成就自动解锁并发放奖励 */
  private checkAchievements(): void {
    for (const item of achievementProgress(this.save.data)) {
      if (!item.unlocked || this.save.data.achievements.includes(item.def.id)) continue;
      this.save.data.achievements.push(item.def.id);
      this.save.data.coins += item.def.reward;
      this.save.data.stats.coinsEarned += item.def.reward;
      this.hud.toast(`成就解锁：${item.def.name} +◈${item.def.reward}`, 'good');
    }
    this.save.save();
    this.menu?.setCoins(this.save.data.coins);
  }

  /** 里程 / 极速 / 步行统计（每 0.1km 落盘一次） */
  private trackProgress(frameDt: number): void {
    if (this.mode === 'menu' || this.paused) return;
    const s = this.dynamics.state;
    const kmh = Math.abs(s.speed) * 3.6;
    if (kmh > this.save.data.stats.topSpeedKmh) this.save.data.stats.topSpeedKmh = kmh;
    this.save.data.stats.playSeconds += frameDt;
    this.pendingKm += (Math.abs(s.speed) * frameDt) / 1000;
    if (this.pendingKm >= 0.1) {
      const km = this.pendingKm;
      this.pendingKm = 0;
      this.save.data.stats.distanceKm += km;
      const coins = Math.floor(km * 2);
      if (coins > 0) {
        this.save.data.coins += coins;
        this.save.data.stats.coinsEarned += coins;
      }
      this.save.save();
    }
    this.saveTimer += frameDt;
    if (this.saveTimer > 10) {
      this.saveTimer = 0;
      this.save.save();
    }
  }

  /** 打开车库（菜单背景保留，车辆在场景里可继续被环绕展示） */
'@

Rep "    // 与交通车辆的圆-圆推离" "    // 行人撞击：倒地 4 秒 + 金币" + "`n" + "    const hits = this.peds.checkHits(s.x, s.z, radius, this.elapsed);" + "`n" + "    if (hits > 0) {" + "`n" + "      this.save.data.stats.pedestrianKills += hits;" + "`n" + "      this.save.data.coins += hits * 5;" + "`n" + "      this.save.data.stats.coinsEarned += hits * 5;" + "`n" + "      this.save.save();" + "`n" + "      this.rig.addShake(0.25);" + "`n" + "    }" + "`n`n" + "    // 与交通车辆的圆-圆推离"

[System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'main patched'
