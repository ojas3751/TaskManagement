package com.example.taskmanagement.support;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * テスト用の PostgreSQL を用意する。
 *
 * <p>開発用 DB（compose.yaml の taskmanagement-db）を使わないのは、Step 8 以降そこに
 * 実データが入る計画であり、テストが実データを触る構成にしたくないため。
 *
 * <p>{@code @ServiceConnection} を付けると、接続先がこのコンテナへ自動で差し替わる。
 * application.properties の spring.datasource.* を書き換える必要はない。
 *
 * <p>イメージは compose.yaml と同じ postgres:17 に揃える。テストだけ別のバージョンで
 * 通しても、本番と同じ DB で動く保証にならない。
 *
 * <p>コンテナはテストクラスごとには立て直らない。Spring はテストコンテキストを
 * 使い回すので、この構成を取り込んだテストクラスの間ではコンテナも共有される。
 * 起動には数秒かかるため、これが効かないとテスト全体が目に見えて遅くなる。
 */
@TestConfiguration(proxyBeanMethods = false)
public class PostgresContainerConfig {

    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgresContainer() {
        return new PostgreSQLContainer<>("postgres:17");
    }
}
