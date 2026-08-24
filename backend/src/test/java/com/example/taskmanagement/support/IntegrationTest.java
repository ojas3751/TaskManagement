package com.example.taskmanagement.support;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * DB を伴うテストの共通設定。
 *
 * <p>5 つの注釈をテストクラスごとに書き並べると、1 つ書き忘れたときに原因の分かりにくい
 * 失敗をする。まとめて 1 つにしておく。
 *
 * <p>設定が全クラスで同一になることには効き目がある。Spring はテストコンテキストを設定内容で
 * 使い回すので、揃えておけば PostgreSQL のコンテナも 1 回の起動で済む。
 *
 * <ul>
 *   <li>{@code @ActiveProfiles("test")} — application-test.properties を読ませる
 *   <li>{@code @Import} — 接続先を使い捨てコンテナへ差し替える
 *   <li>{@code @Transactional} — テストごとに DB を巻き戻す。付けないと、先に走った
 *       テストが入れた行が次のテストから見えて position の期待値が崩れる
 * </ul>
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresContainerConfig.class)
@Transactional
public @interface IntegrationTest {
}
