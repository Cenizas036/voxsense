import torch
import numpy as np


class SimpleSOM:
    def __init__(self, grid_size=(20, 20), input_dim=256, lr=0.5):

        self.grid_x, self.grid_y = grid_size
        self.lr = lr

        self.weights = np.random.randn(self.grid_x, self.grid_y, input_dim)

    def _best_matching_unit(self, vector):

        diff = self.weights - vector
        dist = np.linalg.norm(diff, axis=2)

        return np.unravel_index(np.argmin(dist), dist.shape)

    def update(self, vector):

        x, y = self._best_matching_unit(vector)

        for i in range(self.grid_x):
            for j in range(self.grid_y):

                dist = np.sqrt((x - i) ** 2 + (y - j) ** 2)

                influence = np.exp(-(dist ** 2) / 10)

                self.weights[i, j] += self.lr * influence * (vector - self.weights[i, j])

        return x, y

    def predict(self, vector):

        x, y = self._best_matching_unit(vector)

        return x, y
