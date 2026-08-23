package com.example.taskmanagement.board;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * リストの取得。タスク追加時に、指定された list_id が実在するかの確認と、
 * Card に持たせる親の参照の解決に使う。
 */
public interface TaskListRepository extends JpaRepository<TaskList, UUID> {
}
