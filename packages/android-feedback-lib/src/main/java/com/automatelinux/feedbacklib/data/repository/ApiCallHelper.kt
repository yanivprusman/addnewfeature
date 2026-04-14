package com.automatelinux.feedbacklib.data.repository

import retrofit2.Response

suspend inline fun <T> apiCall(crossinline block: suspend () -> Response<T>): Result<T> {
    return try {
        val response = block()
        if (response.isSuccessful) {
            val body = response.body()
            if (body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception("Empty response body"))
            }
        } else {
            val errorBody = response.errorBody()?.string()
            val message = if (!errorBody.isNullOrBlank()) {
                try {
                    val gson = com.google.gson.Gson()
                    val errorMap = gson.fromJson(errorBody, Map::class.java)
                    errorMap["error"]?.toString() ?: errorBody
                } catch (_: Exception) {
                    errorBody
                }
            } else {
                "HTTP ${response.code()}: ${response.message()}"
            }
            Result.failure(Exception(message))
        }
    } catch (e: Exception) {
        Result.failure(e)
    }
}
