plugins {
	java
	id("org.springframework.boot") version "4.1.0"
	id("io.spring.dependency-management") version "1.1.7"
	// 整形と静的検査（#103）。フロントの oxlint に相当するものが無かった
	id("com.diffplug.spotless") version "7.0.2"
	checkstyle
}

group = "com.example"
version = "0.0.1-SNAPSHOT"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(25)
	}
}

repositories {
	mavenCentral()
}

dependencies {
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")
	implementation("org.springframework.boot:spring-boot-starter-flyway")
	implementation("org.springframework.boot:spring-boot-starter-validation")
	implementation("org.springframework.boot:spring-boot-starter-webmvc")
	implementation("org.flywaydb:flyway-database-postgresql")
	runtimeOnly("org.postgresql:postgresql")
	testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
	testImplementation("org.springframework.boot:spring-boot-starter-flyway-test")
	testImplementation("org.springframework.boot:spring-boot-starter-validation-test")
	testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
	// テストは使い捨ての PostgreSQL コンテナに対して走らせる。開発用 DB を使うと、
	// Step 8 以降そこに入る実データをテストが触ることになるため。
	// バージョンは compose.yaml と揃える（postgres:17）。
	// BOM を取り込むのは、Spring Boot 側の依存管理が org.testcontainers のバージョンを
	// 決めてくれないため。個々の依存に版を書くと、組み合わせがずれても気づけない。
	testImplementation(platform("org.testcontainers:testcontainers-bom:1.21.3"))
	testImplementation("org.springframework.boot:spring-boot-testcontainers")
	testImplementation("org.testcontainers:junit-jupiter")
	testImplementation("org.testcontainers:postgresql")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
	useJUnitPlatform()
}

/*
 * 整形（#103）。
 *
 * **Eclipse の整形器を使う。** palantirJavaFormat と googleJavaFormat は、どちらも
 * JDK 25 上で NoSuchMethodError になる（javac の内部 API に依存しており、JDK 25 で
 * 署名が変わった）。この環境には JDK 25 しか入っておらず、古い JDK へ逃がせない。
 * 規則は 4 スペース・120 桁で、既存コード（4 スペース・最長 111 桁）に合わせてある。
 * 詳細は config/spotless/eclipse-formatter.properties を参照。
 *
 * `./gradlew spotlessApply` で整形、`spotlessCheck` で検査。後者は check に自動で紐づく。
 */
spotless {
	java {
		eclipse().configFile("config/spotless/eclipse-formatter.properties")
		// importOrder は指定しない。既存コードは jakarta → java → org のアルファベット順で
		// グループ間に空行を置いていない。独自の並びを持ち込むと、全ファイルの import が
		// 並べ替わるだけの差分になる
		trimTrailingWhitespace()
		endWithNewline()
	}
}

/*
 * 静的検査（#103）。
 *
 * **整形に関わる項目は入れない。** 見た目は上の Spotless が持っており、両方に持たせると
 * 設定がずれたときに互いを打ち消し合う。ここが見るのは、整形では直らない書き方の問題
 * （未使用の import、空の catch、equals と hashCode の対、命名など）に絞る。
 *
 * そのため google_checks.xml / sun_checks.xml は使わない。どちらもインデントや桁数の
 * 検査を含んでおり、palantir の整形と正面から衝突する。
 */
checkstyle {
	toolVersion = "10.21.4"
	configFile = file("config/checkstyle/checkstyle.xml")
	// 違反があればビルドを失敗させる。導入時点で 0 件であることを確認済み
	isIgnoreFailures = false
	maxWarnings = 0
}
